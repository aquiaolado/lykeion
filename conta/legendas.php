<?php
// lagenda: «A tua legenda». Quem foi a um evento deixa uma frase e, se quiser, uma fotografia; só aparece depois de revista.
//   GET  ?pg=PAGINA            → legendas aprovadas desse evento (JSON)
//   GET  ?recentes             → as últimas legendas aprovadas, de todos os eventos (JSON, para a entrada)
//   POST (formulário, com sessão e cabeçalho X-Lagenda): pg, frase, foto (opcional), consentimento
//   GET  ?rever&k=CHAVE        → página para aprovar ou rejeitar (o link vai no email de aviso)
//   GET  ?foto=NOME&k=CHAVE    → mostra uma fotografia por rever
//   POST ?rever&k=CHAVE: id, decisao (aprovar | rejeitar)
// As fotos por rever ficam em privado/legendas/ e as aprovadas em fotos/l/ (fora do git).
foreach ([__DIR__ . '/../privado', __DIR__ . '/../../privado'] as $d) if (is_file("$d/db.php") && (is_file("$d/config.php") || is_file(dirname((string) realpath($d), 2) . '/privado/config.php'))) { require_once "$d/db.php"; $PRIV = $d; break; }
if (!function_exists('bd')) { http_response_code(503); header('Content-Type: application/json; charset=utf-8'); echo json_encode(['erro' => 'As contas ainda não estão ligadas neste servidor.']); exit; }

const MAX_FRASE = 200;
const MAX_DIA = 5;                       // legendas por pessoa, por dia
const MAX_BYTES = 15 * 1024 * 1024;
$BASE = rtrim(dirname(dirname($_SERVER['SCRIPT_NAME'])), '/') . '/';
$URL = 'https://lagenda.pt';  // links dos emails: sempre o domínio (a pré-visualização em asfeiras.pt/lagenda/ acabou a 3/11/2026)
$URL .= '/';
$PEND = "$PRIV/legendas"; $PUB = __DIR__ . '/../fotos/l';

function ll_bd(): PDO {
  static $ok = false; $pdo = bd();
  if (!$ok) {
    $my = $pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql';
    $id = $my ? 'id INT AUTO_INCREMENT PRIMARY KEY' : 'id INTEGER PRIMARY KEY AUTOINCREMENT';
    $pdo->exec("CREATE TABLE IF NOT EXISTS lg_legendas ($id, utilizador_id INT, pg VARCHAR(120), evento VARCHAR(200), sala VARCHAR(160), frase TEXT, foto VARCHAR(60), largura INT, altura INT, estado VARCHAR(10), criado_em VARCHAR(19), revisto_em VARCHAR(19))" . ($my ? ' DEFAULT CHARSET=utf8mb4' : ''));
    $ok = true;
  }
  return $pdo;
}
function sai($d, $codigo = 200) { http_response_code($codigo); header('Content-Type: application/json; charset=utf-8'); header('Cache-Control: no-store'); echo json_encode($d, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES); exit; }
function chave(): string { global $CFG; return substr(hash_hmac('sha256', 'rever-legendas', (string)($CFG['gestao_password'] ?? '')), 0, 24); }
function chave_ok(): bool { global $CFG; return ($CFG['gestao_password'] ?? '') !== '' && hash_equals(chave(), (string)($_GET['k'] ?? '')); }
function quem(): ?array { // a mesma sessão da conta (conta/api.php)
  $t = $_COOKIE['lagenda_sessao'] ?? ''; if (strlen($t) < 40) return null;
  $q = bd()->prepare('SELECT u.* FROM lg_sessoes s JOIN lg_utilizadores u ON u.id = s.utilizador_id WHERE s.hash = ?');
  $q->execute([hash('sha256', $t)]); return $q->fetch() ?: null;
}
function nome_curto(array $u): string { return ($u['nome'] ?? '') !== '' ? $u['nome'] : explode('@', $u['email'])[0]; }
function publica(array $r): array {
  global $BASE;
  return ['frase' => $r['frase'], 'nome' => $r['nome'] ?? '', 'pg' => $r['pg'], 'evento' => $r['evento'], 'sala' => $r['sala'], 'data' => substr($r['criado_em'], 0, 10)]
    + ($r['foto'] ? ['u' => $BASE . 'fotos/l/' . $r['foto'], 't' => $BASE . 'fotos/l/t-' . $r['foto'], 'w' => (int)$r['largura'], 'h' => (int)$r['altura']] : []);
}
// volta a desenhar a imagem: endireita, reduz e grava em JPEG sem metadados (sem GPS, sem modelo do telemóvel)
function redimensiona($src, $lado) {
  $w = imagesx($src); $h = imagesy($src); $k = min(1, $lado / max($w, $h));
  $nw = max(1, (int)round($w * $k)); $nh = max(1, (int)round($h * $k));
  $dst = imagecreatetruecolor($nw, $nh); imagefill($dst, 0, 0, imagecolorallocate($dst, 255, 255, 255));
  imagecopyresampled($dst, $src, 0, 0, 0, 0, $nw, $nh, $w, $h); return $dst;
}
function guardar_foto(array $f, string $dir): ?array {
  if (($f['error'] ?? 1) !== UPLOAD_ERR_OK || $f['size'] > MAX_BYTES || !function_exists('imagecreatetruecolor')) return null;
  $tipos = [IMAGETYPE_JPEG => 'imagecreatefromjpeg', IMAGETYPE_PNG => 'imagecreatefrompng', IMAGETYPE_WEBP => 'imagecreatefromwebp'];
  $info = @getimagesize($f['tmp_name']);
  if (!$info || !isset($tipos[$info[2]]) || $info[0] * $info[1] > 60000000) return null;
  @ini_set('memory_limit', '384M');
  $src = @$tipos[$info[2]]($f['tmp_name']); if (!$src) return null;
  if ($info[2] === IMAGETYPE_JPEG && function_exists('exif_read_data')) {
    $o = (int)((@exif_read_data($f['tmp_name']))['Orientation'] ?? 1);
    if ($o === 3) $src = imagerotate($src, 180, 0); elseif ($o === 6) $src = imagerotate($src, -90, 0); elseif ($o === 8) $src = imagerotate($src, 90, 0);
  }
  if (!is_dir($dir)) @mkdir($dir, 0755, true);
  $nome = date('Ymd') . '-' . bin2hex(random_bytes(8)) . '.jpg';
  $g = redimensiona($src, 1600); $t = redimensiona($src, 480);
  $ok = imagejpeg($g, "$dir/$nome", 82) && imagejpeg($t, "$dir/t-$nome", 78);
  $r = [$nome, imagesx($g), imagesy($g)];
  imagedestroy($src); imagedestroy($g); imagedestroy($t);
  if (!$ok) { @unlink("$dir/$nome"); @unlink("$dir/t-$nome"); return null; }
  return $r;
}

try {
  // ---- revisão (link com chave, enviado no email de aviso) ----
  if (isset($_GET['foto'])) {
    if (!chave_ok() || !preg_match('/^(t-)?\d{8}-[0-9a-f]{16}\.jpg$/', (string)$_GET['foto']) || !is_file("$PEND/" . $_GET['foto'])) { http_response_code(404); exit; }
    header('Content-Type: image/jpeg'); header('Cache-Control: private, no-store'); readfile("$PEND/" . $_GET['foto']); exit;
  }
  if (isset($_GET['rever'])) {
    if (!chave_ok()) { http_response_code(403); exit('Ligação inválida.'); }
    $pdo = ll_bd(); $msg = '';
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
      $q = $pdo->prepare("SELECT * FROM lg_legendas WHERE id = ? AND estado = 'pendente'"); $q->execute([(int)($_POST['id'] ?? 0)]); $r = $q->fetch();
      if ($r && ($_POST['decisao'] ?? '') === 'aprovar') {
        if ($r['foto']) { if (!is_dir($PUB)) @mkdir($PUB, 0755, true); foreach (['', 't-'] as $p) @rename("$PEND/$p{$r['foto']}", "$PUB/$p{$r['foto']}"); }
        $pdo->prepare("UPDATE lg_legendas SET estado = 'aprovada', revisto_em = ? WHERE id = ?")->execute([date('Y-m-d H:i:s'), $r['id']]); $msg = 'Aprovada e publicada.';
      } elseif ($r && ($_POST['decisao'] ?? '') === 'rejeitar') {
        if ($r['foto']) foreach (['', 't-'] as $p) @unlink("$PEND/$p{$r['foto']}");
        $pdo->prepare("UPDATE lg_legendas SET estado = 'rejeitada', foto = '', revisto_em = ? WHERE id = ?")->execute([date('Y-m-d H:i:s'), $r['id']]); $msg = 'Rejeitada (a fotografia foi apagada).';
      }
    }
    $h = fn($s) => htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8'); $k = $h(chave());
    $q = $pdo->query("SELECT l.*, u.nome, u.email FROM lg_legendas l LEFT JOIN lg_utilizadores u ON u.id = l.utilizador_id WHERE l.estado = 'pendente' ORDER BY l.id");
    header('Content-Type: text/html; charset=utf-8'); header('Cache-Control: no-store');
    echo '<!doctype html><html lang="pt-PT"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="robots" content="noindex"><title>Rever legendas · Lagenda</title>'
      . '<body style="font:16px/1.5 Arial,sans-serif;max-width:720px;margin:30px auto;padding:0 16px;color:#16203A;background:#F4F5F1"><h1 style="font:600 28px Arial,Helvetica,sans-serif">Legendas por rever</h1>'
      . ($msg ? '<p style="background:#F7CC2E;padding:8px 12px">' . $h($msg) . '</p>' : '');
    $n = 0;
    foreach ($q as $r) {
      $n++;
      echo '<div style="background:#fff;border:1px solid #DADDE3;border-radius:6px;padding:14px;margin:14px 0">'
        . '<p style="margin:0;color:#5B6478;font-size:14px">' . $h($r['criado_em']) . ' · ' . $h($r['nome'] ?: $r['email']) . '</p>'
        . '<p style="margin:4px 0"><a href="' . $h($URL . 'e/' . $r['pg'] . '.html') . '">' . $h($r['evento']) . '</a> · ' . $h($r['sala']) . '</p>'
        . '<p style="font:600 20px/1.35 Arial,Helvetica,sans-serif;margin:10px 0;border-left:4px solid #F7CC2E;padding-left:10px">' . $h($r['frase']) . '</p>'
        . ($r['foto'] ? '<img src="?foto=t-' . $h($r['foto']) . '&k=' . $k . '" alt="" style="max-width:100%;border-radius:4px">' : '')
        . '<form method="post" style="display:flex;gap:8px;margin-top:10px"><input type="hidden" name="id" value="' . (int)$r['id'] . '">'
        . '<button name="decisao" value="aprovar" style="padding:8px 14px;background:#16203A;color:#fff;border:0;border-radius:4px">Aprovar</button>'
        . '<button name="decisao" value="rejeitar" style="padding:8px 14px;background:#fff;border:1px solid #16203A;border-radius:4px">Rejeitar</button></form></div>';
    }
    echo $n ? '' : '<p>Não há nada por rever.</p>', '</body></html>'; exit;
  }

  // ---- leitura pública ----
  if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $pdo = ll_bd(); $sql = "SELECT l.*, CASE WHEN u.mostrar = 0 THEN '' ELSE COALESCE(u.nome, '') END nome FROM lg_legendas l LEFT JOIN lg_utilizadores u ON u.id = l.utilizador_id WHERE l.estado = 'aprovada'";
    if (isset($_GET['recentes'])) $q = $pdo->query("$sql ORDER BY l.revisto_em DESC LIMIT 12");
    else { $q = $pdo->prepare("$sql AND l.pg = ? ORDER BY l.id DESC LIMIT 40"); $q->execute([mb_substr((string)($_GET['pg'] ?? ''), 0, 120)]); }
    header('Cache-Control: public, max-age=300');
    sai(['legendas' => array_map('publica', $q->fetchAll())]);
  }

  // ---- envio ----
  if (empty($_SERVER['HTTP_X_LAGENDA'])) sai(['erro' => 'Pedido inválido.'], 400);
  $u = quem(); if (!$u) sai(['erro' => 'Primeiro tens de entrar.'], 401);
  $pg = (string)($_POST['pg'] ?? '');
  $D = json_decode((string)@file_get_contents(__DIR__ . '/../dados.json'), true) ?: ['ev' => [], 'lugares' => []];
  $ev = null; foreach ($D['ev'] as $e) if ($e['pg'] === $pg) { $ev = $e; break; }
  if (!$ev) sai(['erro' => 'Este evento já não está na agenda.'], 400);
  $frase = mb_substr(trim(preg_replace('/\s+/', ' ', strip_tags((string)($_POST['frase'] ?? '')))), 0, MAX_FRASE);
  if (mb_strlen($frase) < 3) sai(['erro' => 'Escreve uma frase sobre o que viste.'], 400);
  if (empty($_POST['consentimento'])) sai(['erro' => 'Falta confirmares que a frase e a fotografia são tuas e que autorizas a publicação.'], 400);
  $pdo = ll_bd();
  $q = $pdo->prepare('SELECT COUNT(*) FROM lg_legendas WHERE utilizador_id = ? AND criado_em >= ?'); $q->execute([$u['id'], date('Y-m-d H:i:s', time() - 86400)]);
  if ((int)$q->fetchColumn() >= MAX_DIA) sai(['erro' => 'Já deixaste várias legendas hoje. Volta amanhã.'], 429);
  $foto = !empty($_FILES['foto']['name']) ? guardar_foto($_FILES['foto'], $PEND) : null;
  if (!empty($_FILES['foto']['name']) && !$foto) sai(['erro' => 'Não conseguimos usar esta fotografia. Usa JPG, PNG ou WebP com menos de 15 MB.'], 400);
  $sala = $D['lugares'][$ev['l']][0] ?? '';
  $pdo->prepare('INSERT INTO lg_legendas (utilizador_id, pg, evento, sala, frase, foto, largura, altura, estado, criado_em) VALUES (?,?,?,?,?,?,?,?,?,?)')
    ->execute([$u['id'], $pg, mb_substr($ev['n'], 0, 200), mb_substr($sala, 0, 160), $frase, $foto[0] ?? '', $foto[1] ?? 0, $foto[2] ?? 0, 'pendente', date('Y-m-d H:i:s')]);
  enviar_email($CFG['email_avisos'], '[lagenda] Legenda nova: ' . $ev['n'], "«$frase»\n— " . nome_curto($u) . ", sobre {$ev['n']} ($sala)" . ($foto ? "\n(com fotografia)" : '')
    . "\n\nPara rever e aprovar: {$URL}conta/legendas.php?rever&k=" . chave() . "\n", '', 'lagenda');
  sai(['ok' => true]);
} catch (Throwable $e) {
  error_log('lagenda legendas: ' . $e->getMessage());
  sai(['erro' => 'Algo correu mal do nosso lado. Tenta outra vez daqui a pouco.'], 500);
}
