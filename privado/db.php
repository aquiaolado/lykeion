<?php
// Ligação à base de dados e criação automática da tabela
$CFG = require __DIR__ . '/config.php';
mb_internal_encoding('UTF-8');

const CAMPOS = [
  'tipo_pedido','papel','feira_original',
  'nome','tipos','concelho','freguesia','local','morada','lat','lon','espaco',
  'dias','semanas','meses','hora_inicio','hora_fim','chuva','feriados',
  'inscricao','preco','vendedores','montagem','regulamento','bancas',
  'estacionamento','transportes','multibanco','wc','acessibilidade',
  'org_tipo','org_nome','org_telefone','org_email','org_site',
  'fonte','notas','email','consentimento','fotos',
];
const CAMPOS_GESTAO = ['estado','estado_publicacao','nota_interna','revisto_em','exportado_em'];

function bd(): PDO {
  static $pdo = null;
  if ($pdo) return $pdo;
  global $CFG;
  $dsn = $CFG['dsn'] ?? ('mysql:host=' . $CFG['db_servidor'] . ';dbname=' . $CFG['db_nome'] . ';charset=utf8mb4');
  $pdo = new PDO($dsn, $CFG['db_utilizador'] ?? null, $CFG['db_password'] ?? null, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
  ]);
  $mysql = $pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql';
  $cols = array_map(fn($c) => "$c TEXT", array_merge(CAMPOS, CAMPOS_GESTAO));
  $id = $mysql ? 'id INT AUTO_INCREMENT PRIMARY KEY' : 'id INTEGER PRIMARY KEY AUTOINCREMENT';
  $pdo->exec("CREATE TABLE IF NOT EXISTS pedidos ($id, criado_em TEXT, " . implode(', ', $cols) . ')' . ($mysql ? ' DEFAULT CHARSET=utf8mb4' : ''));
  return $pdo;
}
function h($s) { return htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8'); }

// Fotografias enviadas pelos visitantes para a página de cada feira ("prova de vida")
function bd_fotos(): PDO {
  static $feito = false;
  $pdo = bd();
  if (!$feito) {
    $mysql = $pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql';
    $id = $mysql ? 'id INT AUTO_INCREMENT PRIMARY KEY' : 'id INTEGER PRIMARY KEY AUTOINCREMENT';
    $pdo->exec("CREATE TABLE IF NOT EXISTS fotos_feira ($id, feira VARCHAR(160), ficheiro VARCHAR(64), largura INT, altura INT,
      data_foto VARCHAR(10), origem_data VARCHAR(12), data_indicada VARCHAR(10), autor VARCHAR(80), email VARCHAR(160),
      criado_em VARCHAR(16), estado VARCHAR(12), revisto_em VARCHAR(16), origem_ip VARCHAR(64), historia TEXT)" . ($mysql ? ' DEFAULT CHARSET=utf8mb4' : ''));
    try { $pdo->query('SELECT historia FROM fotos_feira LIMIT 1'); } catch (Throwable $e) { $pdo->exec('ALTER TABLE fotos_feira ADD COLUMN historia TEXT'); }
    $feito = true;
  }
  return $pdo;
}

// Envia um email em texto simples. Usa SMTP autenticado (caixa de email_remetente) se smtp_password estiver
// preenchido em config.php; senão usa o mail() do PHP. Devolve [true, ''] ou [false, 'motivo da falha'].
// Com $html, vai em duas versões (texto e HTML); $extra junta cabeçalhos (ex.: List-Unsubscribe).
// $via = 'brevo' usa a segunda via (smtp2_* em config.php, ver privado/envios.php), sempre com o mesmo remetente.
function enviar_email($para, $assunto, $texto, $responder = '', $nome = 'asfeiras.pt', $html = '', $extra = '', $via = '') {
  global $CFG;
  $de = (string)$CFG['email_remetente'];
  $as = mb_encode_mimeheader($assunto, 'UTF-8', 'B', "\r\n");
  $cab = "From: $nome <$de>\r\n" . ($responder ? "Reply-To: $responder\r\n" : '') . $extra . "MIME-Version: 1.0\r\n";
  if ($html === '') {
    $cab .= "Content-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n";
    $corpo = chunk_split(base64_encode($texto));
  } else {
    $f = 'lg' . bin2hex(random_bytes(8));
    $cab .= "Content-Type: multipart/alternative; boundary=\"$f\"\r\n";
    $corpo = "--$f\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n" . chunk_split(base64_encode($texto))
           . "--$f\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n" . chunk_split(base64_encode($html)) . "--$f--\r\n";
  }
  $b = $via === 'brevo';
  $pass = (string)($CFG[$b ? 'smtp2_password' : 'smtp_password'] ?? '');
  if ($b && $pass === '') return [false, 'a segunda via (Brevo) não está configurada em privado/config.php'];
  if ($pass === '') {
    error_clear_last();
    if (@mail($para, $as, $corpo, $cab, '-f' . $de)) return [true, ''];
    $e = error_get_last();
    return [false, 'o mail() do servidor recusou o envio' . ($e ? ' (' . $e['message'] . ')' : '') . '; configure o SMTP em privado/config.php'];
  }
  $srv = $b ? (string)($CFG['smtp2_servidor'] ?? 'smtp-relay.brevo.com') : (string)($CFG['smtp_servidor'] ?? 'smtp.hostinger.com');
  $porta = $b ? (int)($CFG['smtp2_porta'] ?? 587) : (int)($CFG['smtp_porta'] ?? 465);
  $utilizador = $b ? (string)($CFG['smtp2_utilizador'] ?? '') : $de;
  $s = @stream_socket_client(($porta === 465 ? 'ssl://' : 'tcp://') . "$srv:$porta", $en, $es, 20);
  if (!$s) return [false, "não foi possível ligar a $srv:$porta ($es)"];
  stream_set_timeout($s, 30);
  $ler = function () use ($s) { $r = ''; while (($l = fgets($s, 1024)) !== false) { $r .= $l; if (strlen($l) < 4 || $l[3] === ' ') break; } return $r; };
  $cmd = function ($c, $esp) use ($s, $ler) {
    if ($c !== null) fwrite($s, $c . "\r\n");
    $r = $ler();
    if (!in_array((int)substr($r, 0, 3), (array)$esp, true)) throw new RuntimeException(trim(preg_replace('/\s+/', ' ', $r)) ?: 'sem resposta do servidor');
    return $r;
  };
  try {
    $cmd(null, 220);
    $cmd('EHLO asfeiras.pt', 250);
    if ($porta === 587) {
      $cmd('STARTTLS', 220);
      if (!stream_socket_enable_crypto($s, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) throw new RuntimeException('não foi possível cifrar a ligação');
      $cmd('EHLO asfeiras.pt', 250);
    }
    $cmd('AUTH LOGIN', 334); $cmd(base64_encode($utilizador), 334); $cmd(base64_encode($pass), 235);
    $cmd("MAIL FROM:<$de>", 250); $cmd("RCPT TO:<$para>", [250, 251]); $cmd('DATA', 354);
    $msg = 'Date: ' . date('r') . "\r\nMessage-ID: <" . bin2hex(random_bytes(12)) . "@" . (explode('@', $de)[1] ?? 'asfeiras.pt') . ">\r\nTo: <$para>\r\nSubject: $as\r\n$cab\r\n$corpo";
    $msg = str_replace(["\r\n", "\r"], "\n", $msg);
    $msg = preg_replace('/^\./m', '..', $msg);
    $cmd(str_replace("\n", "\r\n", rtrim($msg, "\n")) . "\r\n.", 250);
    @fwrite($s, "QUIT\r\n"); fclose($s);
    return [true, ''];
  } catch (Throwable $e) {
    @fwrite($s, "QUIT\r\n"); @fclose($s);
    return [false, 'o servidor de email respondeu: ' . $e->getMessage()];
  }
}
