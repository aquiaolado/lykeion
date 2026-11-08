<?php
// Lykeion (8/11/2026): a caixa info@lykeion.pt, onde chegam as newsletters das faculdades, centros, sociedades científicas e Ordens.
//   GET ?correr → lê os emails novos por IMAP (só leitura: continuam por ler no webmail; no máximo de 10 em 10 minutos),
//                 confirma sozinho as subscrições («clique para confirmar»), guarda as newsletters (texto e ligações) e,
//                 se mudou, grava as dos últimos 21 dias em recolha/newsletters_lykeion.json no ramo fonte do código
//                 (a recolha diária, ferramentas/recolher_eventos.py, tira de lá os eventos: só factos e a ligação oficial).
//   GET ?estado → contagens, sem o conteúdo de nenhum email.
// Usa o config.php do lykeion.pt: email_remetente (info@lykeion.pt) e smtp_password (a palavra-passe dessa caixa), ou
// imap_utilizador / imap_password / imap_servidor se existirem. Só lê caixas @lykeion.pt. Tabelas próprias (ly_caixa,
// ly_nl_confirmacoes) e chaves ly_cx_* em nucleo_estado: nada se mistura com as outras caixas da base comum.
// Só existe no lykeion.pt (gerar_lagenda.py --lykeion copia-o para conta/caixa.php).
foreach ([__DIR__ . '/../privado', __DIR__ . '/../../privado'] as $d) if (is_file("$d/db.php") && (is_file("$d/config.php") || (is_file("$d/config_caminho.php") && (include "$d/config_caminho.php")))) { require_once "$d/db.php"; $PRIV = $d; break; }
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Robots-Tag: noindex');
if (!function_exists('bd')) { http_response_code(503); exit(json_encode(['erro' => 'sem configuração'])); }
require_once "$PRIV/github.php";
require_once "$PRIV/newsletters_lib.php"; // a versão do Lykeion (info@lykeion.pt, «Lykeion»): só as funções puras nl_*

function ly_cfg(): array {
  global $CFG;
  return ['servidor' => (string)($CFG['imap_servidor'] ?? 'ssl://imap.hostinger.com:993'),
          'utilizador' => strtolower((string)($CFG['imap_utilizador'] ?? $CFG['email_remetente'] ?? '')),
          'password' => (string)($CFG['imap_password'] ?? $CFG['smtp_password'] ?? '')];
}
function ly_tabelas(): PDO {
  static $ok = false; $pdo = bd();
  if ($ok) return $pdo;
  $my = $pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql'; $cs = $my ? ' DEFAULT CHARSET=utf8mb4' : '';
  $id = $my ? 'id INT AUTO_INCREMENT PRIMARY KEY' : 'id INTEGER PRIMARY KEY AUTOINCREMENT'; $grande = $my ? 'MEDIUMTEXT' : 'TEXT';
  $pdo->exec("CREATE TABLE IF NOT EXISTS ly_caixa ($id, uid INT UNIQUE, de_email VARCHAR(160), de_nome VARCHAR(200), assunto VARCHAR(300),
    data CHAR(16), texto $grande, ligacoes $grande, estado VARCHAR(16), criado_em CHAR(16))$cs");
  $pdo->exec("CREATE TABLE IF NOT EXISTS ly_nl_confirmacoes ($id, de_email VARCHAR(160), assunto VARCHAR(300), url TEXT, http INT, em CHAR(16), resultado VARCHAR(20), nota TEXT)$cs");
  gh_estado_tab($pdo);
  $ok = true; return $pdo;
}
function ly_estado(string $k, ?string $v = null): string {
  $pdo = ly_tabelas(); $k = 'ly_cx_' . $k;
  if ($v !== null) { $pdo->prepare('DELETE FROM nucleo_estado WHERE chave = ?')->execute([$k]); $pdo->prepare('INSERT INTO nucleo_estado (chave, valor) VALUES (?,?)')->execute([$k, $v]); return $v; }
  $q = $pdo->prepare('SELECT valor FROM nucleo_estado WHERE chave = ?'); $q->execute([$k]); return (string)$q->fetchColumn();
}

// ---- IMAP mínimo (o mesmo método da caixa de entrada da gestão) ----
final class LyImap {
  private $fp; private int $n = 0;
  function __construct(string $servidor, string $u, string $p) {
    $ctx = stream_context_create(['ssl' => ['verify_peer' => true, 'verify_peer_name' => true]]);
    $this->fp = @stream_socket_client($servidor, $en, $es, 15, STREAM_CLIENT_CONNECT, $ctx);
    if (!$this->fp) throw new RuntimeException("Não consegui ligar ao servidor de email ($es).");
    stream_set_timeout($this->fp, 30);
    $this->linha();
    [$ok] = $this->cmd('LOGIN ' . $this->q($u) . ' ' . $this->q($p));
    if (!$ok) throw new RuntimeException('O servidor de email recusou a entrada (palavra-passe errada?).');
  }
  private function q(string $s): string { return '"' . addcslashes($s, "\"\\") . '"'; }
  private function linha(): string { $l = fgets($this->fp); if ($l === false) throw new RuntimeException('O servidor de email deixou de responder.'); return $l; }
  function cmd(string $c): array {
    $tag = 'A' . (++$this->n); fwrite($this->fp, "$tag $c\r\n"); $out = '';
    while (true) {
      $l = $this->linha();
      if (preg_match('/\{(\d+)\}\r\n$/', $l, $m)) {
        $out .= $l; $falta = (int)$m[1];
        while ($falta > 0) { $b = fread($this->fp, min(65536, $falta)); if ($b === false || $b === '') throw new RuntimeException('Ligação ao email interrompida.'); $out .= $b; $falta -= strlen($b); }
        continue;
      }
      if (str_starts_with($l, "$tag ")) return [str_starts_with($l, "$tag OK"), $out];
      $out .= $l;
    }
  }
  function uids_desde(int $ultimo, string $desde): array {
    [$ok, $r] = $this->cmd($ultimo > 0 ? 'UID SEARCH UID ' . ($ultimo + 1) . ':*' : 'UID SEARCH SINCE ' . $desde);
    if (!$ok || !preg_match('/\* SEARCH([\d ]*)/', $r, $m)) return [];
    return array_values(array_filter(array_map('intval', preg_split('/\s+/', trim($m[1]))), fn($u) => $u > $ultimo));
  }
  function mensagem(int $uid): string {
    [$ok, $r] = $this->cmd("UID FETCH $uid (BODY.PEEK[]<0.3000000>)"); // PEEK: não marca como lido
    if (!$ok || !preg_match('/\{(\d+)\}\r\n/', $r, $m, PREG_OFFSET_CAPTURE)) return '';
    return substr($r, $m[0][1] + strlen($m[0][0]), (int)$m[1][0]);
  }
  function fechar(): void { try { $this->cmd('LOGOUT'); } catch (Throwable $e) {} @fclose($this->fp); }
}

// ---- Ler uma mensagem (MIME) ----
function ly_cab(string $bloco): array {
  $bloco = preg_replace("/\r?\n[ \t]+/", ' ', $bloco); $h = [];
  foreach (preg_split("/\r?\n/", $bloco) as $l) if (preg_match('/^([A-Za-z0-9-]+):\s*(.*)$/', $l, $m)) $h[strtolower($m[1])] ??= $m[2];
  return $h;
}
function ly_dec_cab(string $s): string {
  if (!str_contains($s, '=?')) return mb_check_encoding($s, 'UTF-8') ? $s : mb_convert_encoding($s, 'UTF-8', 'Windows-1252');
  $r = @iconv_mime_decode($s, ICONV_MIME_DECODE_CONTINUE_ON_ERROR, 'UTF-8');
  return $r !== false ? $r : (string)mb_decode_mimeheader($s);
}
function ly_param(string $cab, string $p): string {
  if (preg_match('/' . $p . '\*?=\s*"([^"]*)"/i', $cab, $m) || preg_match('/' . $p . '\*?=\s*([^;\s]+)/i', $cab, $m)) return ly_dec_cab($m[1]);
  return '';
}
function ly_utf8(string $t, string $cs): string {
  $cs = strtolower(trim($cs)) ?: 'utf-8';
  if ($cs !== 'utf-8' && $cs !== 'us-ascii') { $c = @mb_convert_encoding($t, 'UTF-8', $cs === 'windows-1252' ? 'Windows-1252' : $cs); if ($c !== false) $t = $c; }
  return mb_check_encoding($t, 'UTF-8') ? $t : mb_convert_encoding($t, 'UTF-8', 'Windows-1252');
}
function ly_partes(string $raw, array &$o, int $fundo = 0): void {
  if ($fundo > 8) return;
  $sep = preg_match("/\r?\n\r?\n/", $raw, $m, PREG_OFFSET_CAPTURE) ? $m[0][1] : strlen($raw);
  $h = ly_cab(substr($raw, 0, $sep)); $corpo = (string)substr($raw, $sep + ($sep < strlen($raw) ? strlen($m[0][0]) : 0));
  $ct = strtolower($h['content-type'] ?? 'text/plain'); $disp = $h['content-disposition'] ?? '';
  if (str_starts_with($ct, 'multipart/')) {
    $b = ly_param($h['content-type'], 'boundary'); if ($b === '') return;
    $bits = explode('--' . $b, $corpo); array_shift($bits);
    foreach ($bits as $p) { if (str_starts_with($p, '--')) break; ly_partes(ltrim($p, "\r\n"), $o, $fundo + 1); }
    return;
  }
  if (stripos($disp, 'attachment') === 0 || ly_param($disp, 'filename') !== '') return; // anexos não interessam
  $te = strtolower($h['content-transfer-encoding'] ?? '');
  if ($te === 'base64') $corpo = (string)base64_decode(preg_replace('/\s+/', '', $corpo));
  elseif ($te === 'quoted-printable') $corpo = quoted_printable_decode($corpo);
  $corpo = ly_utf8($corpo, ly_param($h['content-type'] ?? '', 'charset'));
  if (str_starts_with($ct, 'text/plain') && $o['texto'] === '') $o['texto'] = $corpo;
  elseif (str_starts_with($ct, 'text/html') && $o['html'] === '') $o['html'] = $corpo;
}
function ly_ler(string $raw): array {
  $sep = preg_match("/\r?\n\r?\n/", $raw, $m, PREG_OFFSET_CAPTURE) ? $m[0][1] : strlen($raw);
  $h = ly_cab(substr($raw, 0, $sep));
  $o = ['texto' => '', 'html' => '']; ly_partes($raw, $o);
  $t = $o['texto'];
  if (trim($t) === '' && $o['html'] !== '') { // só HTML: o texto sai do HTML, linha a linha
    $x = preg_replace(['#<(style|script|head)[^>]*>.*?</\1>#is', '#<br\s*/?>#i', '#</(p|div|tr|li|h\d|td|table)>#i'], ['', "\n", "\n"], $o['html']);
    $t = html_entity_decode(strip_tags($x), ENT_QUOTES | ENT_HTML5, 'UTF-8');
  }
  $t = trim(preg_replace("/\n{3,}/", "\n\n", preg_replace("/[ \t\x{00A0}]+/u", ' ', str_replace(["\r\n", "\r"], "\n", $t))));
  $de = ly_dec_cab($h['from'] ?? ''); $email = preg_match('/<([^>]+)>/', $de, $x) ? $x[1] : trim($de);
  return ['de_email' => mb_strtolower(trim($email)), 'de_nome' => trim(preg_replace('/<[^>]+>/', '', $de), " \"'"),
          'assunto' => ly_dec_cab($h['subject'] ?? ''), 'data' => date('Y-m-d H:i', strtotime($h['date'] ?? '') ?: time()),
          'texto' => mb_substr($t, 0, 40000), 'html' => $o['html'], 'lista' => isset($h['list-unsubscribe']) || isset($h['list-id'])];
}

// ---- Buscar emails novos ----
function ly_atualizar(bool $forcar): array {
  $cfg = ly_cfg();
  if (!preg_match('/@lykeion\.pt$/', $cfg['utilizador'])) return ['erro' => 'a caixa configurada não é do lykeion.pt'];
  if ($cfg['password'] === '') return ['erro' => 'sem palavra-passe da caixa'];
  if (!$forcar && (time() - (int)ly_estado('visto')) < 600) return ['novos' => 0, 'nota' => 'visto há menos de 10 minutos'];
  ly_estado('visto', (string)time());
  $pdo = ly_tabelas(); $r = ['novos' => 0, 'newsletters' => 0, 'confirmadas' => 0, 'por_confirmar' => 0];
  try {
    $im = new LyImap($cfg['servidor'], $cfg['utilizador'], $cfg['password']);
    [$ok] = $im->cmd('EXAMINE INBOX'); // só leitura
    if (!$ok) throw new RuntimeException('Não consegui abrir a caixa de entrada.');
    $ultimo = (int)ly_estado('ultimo_uid');
    $ins = $pdo->prepare('INSERT INTO ly_caixa (uid, de_email, de_nome, assunto, data, texto, ligacoes, estado, criado_em) VALUES (?,?,?,?,?,?,?,?,?)');
    foreach (array_slice($im->uids_desde($ultimo, date('j-M-Y', strtotime('-30 days'))), 0, 40) as $uid) { // 40 de cada vez
      $m = ly_ler($im->mensagem($uid)); $r['novos']++;
      $estado = 'outro'; $texto = ''; $lig = '';
      if ($m['de_email'] !== $cfg['utilizador'] && !preg_match('/(mailer-daemon|postmaster)/i', $m['de_email'])) {
        $link = nl_link_confirmacao($m);
        if ($link !== '') { // pedido de confirmação da subscrição: abre o link (e o segundo clique, se a página o pedir)
          $ja = $pdo->prepare("SELECT COUNT(*) FROM ly_nl_confirmacoes WHERE url = ? AND resultado = 'ok'"); $ja->execute([$link]);
          if ((int)$ja->fetchColumn()) $estado = 'confirmada';
          else {
            [$http, $res, $nota] = nl_confirmar($link);
            $pdo->prepare('INSERT INTO ly_nl_confirmacoes (de_email, assunto, url, http, em, resultado, nota) VALUES (?,?,?,?,?,?,?)')
              ->execute([$m['de_email'], mb_substr($m['assunto'], 0, 300), $link, $http, date('Y-m-d H:i'), $res, mb_substr($nota, 0, 500)]);
            $estado = $res === 'ok' ? 'confirmada' : 'por_confirmar';
          }
          $r[$estado === 'confirmada' ? 'confirmadas' : 'por_confirmar']++;
        } elseif ($m['lista']) { // envio em massa (List-Unsubscribe/List-Id): é uma newsletter
          $estado = 'newsletter'; $texto = $m['texto']; $lig = nl_ligacoes_evento($m); $r['newsletters']++;
        }
      }
      // de um email que não é newsletter fica só quem enviou e o assunto (o resto vê-se no webmail)
      try { $ins->execute([$uid, $m['de_email'], mb_substr($m['de_nome'], 0, 200), mb_substr($m['assunto'], 0, 300), $m['data'], $texto, $lig, $estado, date('Y-m-d H:i')]); } catch (Throwable $e) {} // já guardado
      ly_estado('ultimo_uid', (string)$uid);
    }
    $im->fechar(); ly_estado('erro', '');
  } catch (Throwable $e) { ly_estado('erro', date('Y-m-d H:i') . ' — ' . $e->getMessage()); $r['erro'] = $e->getMessage(); }
  return $r;
}

// Grava recolha/newsletters_lykeion.json na fonte se mudou (no máximo de hora a hora).
function ly_exportar(bool $forcar): string {
  if (!$forcar && (time() - (int)ly_estado('exportado')) < 3600) return '';
  if (!gh_ligado()) return 'sem chave do GitHub';
  $q = ly_tabelas()->prepare("SELECT uid, de_email, de_nome, assunto, data, texto, ligacoes FROM ly_caixa WHERE estado = 'newsletter' AND data >= ? ORDER BY data");
  $q->execute([date('Y-m-d', strtotime('-21 days'))]); $lista = [];
  foreach ($q->fetchAll(PDO::FETCH_ASSOC) as $e) {
    if (preg_match(NL_PEDIDO, $e['assunto']) && preg_match('/(confirm|valid|verifi|ativ|activ|bem.?vind|welcome|obrigad)/iu', $e['assunto'])) continue;
    $lista[] = ['uid' => (int)$e['uid'], 'de_email' => $e['de_email'], 'de_nome' => $e['de_nome'], 'assunto' => $e['assunto'], 'data' => $e['data'],
                'texto' => mb_substr((string)$e['texto'], 0, 30000), 'ligacoes' => json_decode((string)$e['ligacoes'], true) ?: []];
  }
  ly_estado('exportado', (string)time());
  $h = md5(json_encode($lista));
  if ($h === ly_estado('exportado_hash')) return count($lista) . ' newsletters (sem mudanças)';
  $json = json_encode(['gerado_em' => date('Y-m-d H:i'), 'caixa' => 'info@lykeion.pt', 'newsletters' => $lista], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT) . "\n";
  gh_gravar(['recolha/newsletters_lykeion.json' => $json], 'Lykeion: newsletters recebidas em info@lykeion.pt (' . date('Y-m-d') . ', ' . count($lista) . ')');
  ly_estado('exportado_hash', $h);
  return count($lista) . ' newsletters gravadas';
}

try {
  if (isset($_GET['correr'])) {
    $r = ly_atualizar(false);
    try { $r['exportar'] = ly_exportar(isset($_GET['exportar'])); } catch (Throwable $e) { $r['exportar'] = 'falhou: ' . $e->getMessage(); }
    exit(json_encode($r, JSON_UNESCAPED_UNICODE));
  }
  $pdo = ly_tabelas(); $c = [];
  foreach ($pdo->query('SELECT estado, COUNT(*) n FROM ly_caixa GROUP BY estado') as $x) $c[$x['estado']] = (int)$x['n'];
  $rem = (int)$pdo->query("SELECT COUNT(DISTINCT de_email) FROM ly_caixa WHERE estado = 'newsletter'")->fetchColumn();
  $cfg = ly_cfg();
  $pc = $pdo->query("SELECT de_email, assunto, em FROM ly_nl_confirmacoes c WHERE resultado <> 'ok' AND NOT EXISTS (SELECT 1 FROM ly_nl_confirmacoes o WHERE o.url = c.url AND o.resultado = 'ok') ORDER BY id DESC LIMIT 50")->fetchAll(PDO::FETCH_ASSOC);
  exit(json_encode(['caixa' => $cfg['utilizador'], 'subscricoes_por_confirmar' => $pc, 'pronta' => $cfg['password'] !== '' && preg_match('/@lykeion\.pt$/', $cfg['utilizador']) === 1,
    'emails' => $c, 'remetentes_newsletter' => $rem, 'ultima_leitura' => ($v = (int)ly_estado('visto')) ? date('Y-m-d H:i', $v) : null,
    'erro' => ly_estado('erro') ?: null, 'github' => gh_ligado()], JSON_UNESCAPED_UNICODE));
} catch (Throwable $e) { http_response_code(500); exit(json_encode(['erro' => $e->getMessage()], JSON_UNESCAPED_UNICODE)); }
