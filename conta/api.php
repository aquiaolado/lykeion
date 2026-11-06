<?php
// lagenda: contas pessoais. Entrar por link no email (sem palavra-passe) ou com Google; gostos, salas e artistas seguidos,
// guardados e newsletter. Responde em JSON. A base de dados e o envio de email são os do servidor (privado/db.php).
//   GET  ?eu                  → {conta: null | {email, gostos, newsletter}, guardados: [...], google: client_id|null}
//   GET  ?link=TOKEN          → abre a sessão e volta à página da conta
//   POST {acao:"entrar", email, voltar}   → envia o link
//   POST {acao:"google", credencial}      → entra com Google
//   POST {acao:"gostos", gostos, newsletter}
//   POST {acao:"guardar", pg, on}  ·  {acao:"juntar", guardados:[...]}  ·  {acao:"sair"}  ·  {acao:"apagar"}
// Os pedidos POST têm de trazer o cabeçalho X-Lagenda (defesa contra pedidos forjados por outros sites).

// privado/ com config.php: o do próprio site (lagenda.pt) ou, na pré-visualização em asfeiras.pt/lagenda/, o do asfeiras
foreach ([__DIR__ . '/../privado', __DIR__ . '/../../privado'] as $d) if (is_file("$d/db.php") && (is_file("$d/config.php") || is_file(dirname((string) realpath($d), 2) . '/privado/config.php'))) { require_once "$d/db.php"; break; }
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
if (!function_exists('bd')) { http_response_code(503); echo json_encode(['erro' => 'As contas ainda não estão ligadas neste servidor.']); exit; }

// o mesmo cliente Google do asfeiras.pt (público); cada domínio tem de estar nas origens autorizadas do cliente
if (empty($CFG['google_client_id'])) $CFG['google_client_id'] = '206764452565-4kjemfh1kd05fingifhj1ipav01vta4l.apps.googleusercontent.com';
const COOKIE = 'lagenda_sessao';
$BASE = rtrim(dirname(dirname($_SERVER['SCRIPT_NAME'])), '/') . '/';      // /  ou  /lagenda/
$URL = 'https://lykeion.pt/';  // links dos emails: sempre o domínio (antes https://HTTP_HOST/BASE)

function lg_bd(): PDO {
  static $ok = false; $pdo = bd();
  if (!$ok) {
    $my = $pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql'; $cs = $my ? ' DEFAULT CHARSET=utf8mb4' : '';
    $id = $my ? 'id INT AUTO_INCREMENT PRIMARY KEY' : 'id INTEGER PRIMARY KEY AUTOINCREMENT';
    foreach (["lg_utilizadores ($id, email VARCHAR(190) UNIQUE, nome VARCHAR(120), google_sub VARCHAR(64), gostos TEXT, newsletter SMALLINT DEFAULT 0, criado_em VARCHAR(19), ultimo_em VARCHAR(19))",
              "lg_links (hash CHAR(64) PRIMARY KEY, email VARCHAR(190), voltar VARCHAR(200), criado_em VARCHAR(19), usado SMALLINT DEFAULT 0)",
              "lg_sessoes (hash CHAR(64) PRIMARY KEY, utilizador_id INT, criado_em VARCHAR(19), visto_em VARCHAR(19))",
              "lg_guardados (utilizador_id INT, pg VARCHAR(120), criado_em VARCHAR(19), PRIMARY KEY (utilizador_id, pg))",
              "lg_pedidos (quem VARCHAR(190), quando VARCHAR(19))",
              "lg_presencas (utilizador_id INT, pg VARCHAR(120), estado VARCHAR(4), nota SMALLINT DEFAULT 0, criado_em VARCHAR(19), PRIMARY KEY (utilizador_id, pg))",
              "lg_amigos (a INT, b INT, criado_em VARCHAR(19), PRIMARY KEY (a, b))"] as $t) $pdo->exec("CREATE TABLE IF NOT EXISTS $t$cs");
    foreach (['codigo VARCHAR(12)', 'mostrar SMALLINT DEFAULT 1'] as $col) { // colunas acrescentadas depois
      $n = explode(' ', $col)[0];
      try { $pdo->query("SELECT $n FROM lg_utilizadores LIMIT 1"); } catch (Throwable $e) { $pdo->exec("ALTER TABLE lg_utilizadores ADD COLUMN $col"); }
    }
    $ok = true;
  }
  return $pdo;
}
function agora() { return date('Y-m-d H:i:s'); }
function sai($d, $codigo = 200) { http_response_code($codigo); echo json_encode($d, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES); exit; }
function quem(): ?array {
  $t = $_COOKIE[COOKIE] ?? ''; if (strlen($t) < 40) return null;
  $q = lg_bd()->prepare('SELECT u.* FROM lg_sessoes s JOIN lg_utilizadores u ON u.id = s.utilizador_id WHERE s.hash = ?');
  $q->execute([hash('sha256', $t)]); $u = $q->fetch();
  return $u ?: null;
}
function abrir_sessao(int $uid) {
  global $BASE;
  $t = bin2hex(random_bytes(32));
  lg_bd()->prepare('INSERT INTO lg_sessoes (hash, utilizador_id, criado_em, visto_em) VALUES (?,?,?,?)')->execute([hash('sha256', $t), $uid, agora(), agora()]);
  setcookie(COOKIE, $t, ['expires' => time() + 365 * 86400, 'path' => $BASE, 'secure' => true, 'httponly' => true, 'samesite' => 'Lax']);
}
function utilizador(string $email, array $extra = []): int {
  $pdo = lg_bd(); $q = $pdo->prepare('SELECT id FROM lg_utilizadores WHERE email = ?'); $q->execute([$email]);
  if ($id = $q->fetchColumn()) { $pdo->prepare('UPDATE lg_utilizadores SET ultimo_em = ? WHERE id = ?')->execute([agora(), $id]); return (int)$id; }
  $pdo->prepare('INSERT INTO lg_utilizadores (email, nome, google_sub, gostos, newsletter, criado_em, ultimo_em) VALUES (?,?,?,?,?,?,?)')
      ->execute([$email, $extra['nome'] ?? '', $extra['sub'] ?? '', '{}', 0, agora(), agora()]);
  return (int)$pdo->lastInsertId();
}
function codigo_de(array $u): string { // código do link de convite (criado da primeira vez que é preciso)
  if (!empty($u['codigo'])) return $u['codigo'];
  $c = substr(strtr(base64_encode(random_bytes(9)), '+/', 'xz'), 0, 10);
  lg_bd()->prepare('UPDATE lg_utilizadores SET codigo = ? WHERE id = ?')->execute([$c, $u['id']]);
  return $c;
}
function nome_curto(array $u): string { return $u['nome'] !== '' ? $u['nome'] : explode('@', $u['email'])[0]; }
function amigos_de(int $uid): array {
  $q = lg_bd()->prepare('SELECT u.id, u.nome, u.email, u.mostrar FROM lg_amigos a JOIN lg_utilizadores u ON u.id = a.b WHERE a.a = ? ORDER BY u.nome, u.email');
  $q->execute([$uid]); return $q->fetchAll();
}
function demasiados(string $quem, int $max, int $minutos): bool {
  $pdo = lg_bd(); $desde = date('Y-m-d H:i:s', time() - $minutos * 60);
  $pdo->prepare('DELETE FROM lg_pedidos WHERE quando < ?')->execute([date('Y-m-d H:i:s', time() - 86400)]);
  $q = $pdo->prepare('SELECT COUNT(*) FROM lg_pedidos WHERE quem = ? AND quando >= ?'); $q->execute([$quem, $desde]);
  if ((int)$q->fetchColumn() >= $max) return true;
  $pdo->prepare('INSERT INTO lg_pedidos (quem, quando) VALUES (?,?)')->execute([$quem, agora()]);
  return false;
}

try {
  // ---- o link do email ----
  if (isset($_GET['link'])) {
    header('Content-Type: text/html; charset=utf-8');
    $q = lg_bd()->prepare('SELECT * FROM lg_links WHERE hash = ?'); $q->execute([hash('sha256', (string)$_GET['link'])]); $l = $q->fetch();
    if (!$l || $l['usado'] || strtotime($l['criado_em']) < time() - 3600) { header('Location: ' . $BASE . 'conta.html#expirado'); exit; }
    lg_bd()->prepare('UPDATE lg_links SET usado = 1 WHERE hash = ?')->execute([$l['hash']]);
    abrir_sessao(utilizador($l['email']));
    $v = (string)$l['voltar']; header('Location: ' . (preg_match('#^/[A-Za-z0-9/_.\-]*$#', $v) ? $v : $BASE . 'conta.html#entrou')); exit;
  }
  if ($_SERVER['REQUEST_METHOD'] === 'GET' && isset($_GET['social'])) { // contagens de um evento e amigos que vão
    $pg = mb_substr((string)$_GET['social'], 0, 120); $u = quem(); $pdo = lg_bd();
    $q = $pdo->prepare("SELECT SUM(CASE WHEN estado = 'vou' THEN 1 ELSE 0 END) vou, SUM(CASE WHEN estado = 'fui' THEN 1 ELSE 0 END) fui, SUM(CASE WHEN nota = 1 THEN 1 ELSE 0 END) sim, SUM(CASE WHEN nota = -1 THEN 1 ELSE 0 END) nao FROM lg_presencas WHERE pg = ?");
    $q->execute([$pg]); $c = array_map('intval', $q->fetch() ?: []);
    $eu = null; $am = [];
    if ($u) {
      $q = $pdo->prepare('SELECT estado, nota FROM lg_presencas WHERE utilizador_id = ? AND pg = ?'); $q->execute([$u['id'], $pg]); $eu = $q->fetch() ?: null;
      $q = $pdo->prepare("SELECT u.nome, u.email, p.estado, p.nota FROM lg_amigos a JOIN lg_presencas p ON p.utilizador_id = a.b AND p.pg = ? JOIN lg_utilizadores u ON u.id = a.b WHERE a.a = ? AND u.mostrar = 1");
      $q->execute([$pg, $u['id']]); foreach ($q as $r) $am[] = ['nome' => nome_curto($r), 'estado' => $r['estado'], 'nota' => (int)$r['nota']];
    }
    sai(['vou' => $c['vou'] ?? 0, 'fui' => $c['fui'] ?? 0, 'recomendam' => $c['sim'] ?? 0, 'nao' => $c['nao'] ?? 0, 'eu' => $eu, 'amigos' => $am]);
  }
  if ($_SERVER['REQUEST_METHOD'] === 'GET' && isset($_GET['populares'])) { // os mais procurados (vou + guardados), últimas semanas
    $desde = date('Y-m-d H:i:s', time() - 30 * 86400);
    $q = lg_bd()->prepare("SELECT pg, COUNT(*) n FROM (SELECT pg FROM lg_presencas WHERE estado = 'vou' AND criado_em >= ? UNION ALL SELECT pg FROM lg_guardados WHERE criado_em >= ?) t GROUP BY pg ORDER BY n DESC LIMIT 60");
    $q->execute([$desde, $desde]); sai(['populares' => array_map(fn($r) => [$r['pg'], (int)$r['n']], $q->fetchAll())]);
  }
  if ($_SERVER['REQUEST_METHOD'] === 'GET' && isset($_GET['amigos_vao'])) {
    $u = quem(); if (!$u) sai(['amigos_vao' => []]);
    $q = lg_bd()->prepare("SELECT p.pg, u.nome, u.email FROM lg_amigos a JOIN lg_presencas p ON p.utilizador_id = a.b AND p.estado = 'vou' JOIN lg_utilizadores u ON u.id = a.b WHERE a.a = ? AND u.mostrar = 1");
    $q->execute([$u['id']]); $r = [];
    foreach ($q as $x) $r[$x['pg']][] = nome_curto($x);
    sai(['amigos_vao' => $r]);
  }
  if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $u = quem(); $g = [];
    if ($u) { $q = lg_bd()->prepare('SELECT pg FROM lg_guardados WHERE utilizador_id = ? ORDER BY criado_em DESC'); $q->execute([$u['id']]); $g = $q->fetchAll(PDO::FETCH_COLUMN); }
    sai(['conta' => $u ? ['email' => $u['email'], 'nome' => $u['nome'], 'gostos' => json_decode($u['gostos'] ?: '{}', true) ?: new stdClass(), 'newsletter' => (int)$u['newsletter'],
                          'codigo' => codigo_de($u), 'mostrar' => (int)($u['mostrar'] ?? 1), 'amigos' => array_map(fn($a) => ['id' => (int)$a['id'], 'nome' => nome_curto($a)], amigos_de((int)$u['id']))] : null,
         'guardados' => $g, 'google' => ($CFG['google_client_id'] ?? '') ?: null]);
  }
  if ($_SERVER['REQUEST_METHOD'] !== 'POST' || empty($_SERVER['HTTP_X_LAGENDA'])) sai(['erro' => 'Pedido inválido.'], 400);
  $p = json_decode(file_get_contents('php://input'), true) ?: []; $acao = (string)($p['acao'] ?? '');

  if ($acao === 'entrar') {
    $email = mb_strtolower(trim((string)($p['email'] ?? '')));
    if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 190) sai(['erro' => 'Escreve um endereço de email válido.'], 400);
    if (demasiados('ip:' . ($_SERVER['REMOTE_ADDR'] ?? ''), 10, 60) || demasiados('e:' . $email, 3, 15)) sai(['erro' => 'Já pedimos vários links há pouco. Vê o teu email ou tenta daqui a 15 minutos.'], 429);
    $t = bin2hex(random_bytes(32)); $voltar = (string)($p['voltar'] ?? '');
    lg_bd()->prepare('INSERT INTO lg_links (hash, email, voltar, criado_em, usado) VALUES (?,?,?,?,0)')->execute([hash('sha256', $t), $email, mb_substr($voltar, 0, 200), agora()]);
    $link = $URL . 'conta/api.php?link=' . $t;
    [$ok, $erro] = enviar_email($email, 'Entrar no Lykeion', "Olá,\n\nPara entrar no Lykeion, abra este link (vale durante uma hora e só uma vez):\n\n$link\n\nSe não pediu para entrar, ignore este email: sem abrir o link, nada acontece.\n\nLykeion · Tudo o que se passa na ciência do país", '', 'Lykeion');
    if (!$ok) sai(['erro' => 'Não conseguimos enviar o email agora. Tenta daqui a pouco.'], 502);
    sai(['ok' => true]);
  }
  if ($acao === 'google') {
    $cid = (string)($CFG['google_client_id'] ?? ''); if ($cid === '') sai(['erro' => 'A entrada com Google ainda não está ligada.'], 400);
    $r = @file_get_contents('https://oauth2.googleapis.com/tokeninfo?id_token=' . rawurlencode((string)($p['credencial'] ?? '')));
    $i = $r ? json_decode($r, true) : null;
    if (!$i || ($i['aud'] ?? '') !== $cid || ($i['email_verified'] ?? '') !== 'true' || !filter_var($i['email'] ?? '', FILTER_VALIDATE_EMAIL)) sai(['erro' => 'A Google não confirmou a entrada. Tenta outra vez.'], 401);
    abrir_sessao(utilizador(mb_strtolower($i['email']), ['nome' => $i['name'] ?? '', 'sub' => $i['sub'] ?? '']));
    sai(['ok' => true]);
  }
  $u = quem(); if (!$u) sai(['erro' => 'Primeiro tens de entrar.'], 401);
  $pdo = lg_bd();
  if ($acao === 'gostos') {
    $g = (array)($p['gostos'] ?? []); $limpo = [];
    foreach (['cats', 'bairros', 'salas', 'artistas', 'onde'] as $k) $limpo[$k] = array_slice(array_values(array_filter(array_map(fn($x) => mb_substr((string)$x, 0, 80), (array)($g[$k] ?? [])))), 0, 300);
    $limpo['livre'] = !empty($g['livre']);
    if (is_array($g['toques'] ?? null)) { // página inicial dos três toques (toques.js): os toques escolhidos e o que aprendeu
      $t = $g['toques']; $tq = [];
      foreach (['onde', 'vontade', 'quem', 'preco'] as $k) if (isset($t[$k])) $tq[$k] = mb_substr((string)$t[$k], 0, 40);
      $tq['menos'] = [];
      foreach (array_slice((array)($t['menos'] ?? []), 0, 100, true) as $k => $v) if (is_numeric($v)) $tq['menos'][mb_substr((string)$k, 0, 40)] = max(-20, min(20, round((float)$v, 2)));
      $tq['duelos'] = max(0, min(100000, (int)($t['duelos'] ?? 0)));
      $limpo['toques'] = $tq;
    }
    if (is_array($g['lyk'] ?? null)) { // Lykeion (4/11/2026): instituições e áreas seguidas, avisos e newsletter de segunda (conta/lykeion.php)
      $l = $g['lyk']; $ly = [];
      foreach (['inst', 'areas', 'listas'] as $k) $ly[$k] = array_slice(array_values(array_filter(array_map(fn($x) => mb_substr((string)$x, 0, 80), (array)($l[$k] ?? [])))), 0, 300);
      $ly['avisos'] = !array_key_exists('avisos', $l) || !empty($l['avisos']); $ly['semanal'] = !array_key_exists('semanal', $l) || !empty($l['semanal']);
      $limpo['lyk'] = $ly;
    }
    $limpo['avisos'] = !array_key_exists('avisos', $g) || !empty($g['avisos']); // avisos por email dos artistas seguidos (conta/alertas.php)
    $pdo->prepare('UPDATE lg_utilizadores SET gostos = ?, newsletter = ? WHERE id = ?')->execute([json_encode($limpo, JSON_UNESCAPED_UNICODE), empty($p['newsletter']) ? 0 : 1, $u['id']]);
    sai(['ok' => true]);
  }
  if ($acao === 'presenca') { // vou / fui (com recomendação) / nada
    $pg = mb_substr((string)($p['pg'] ?? ''), 0, 120); $e = (string)($p['estado'] ?? '');
    if ($pg === '') sai(['erro' => 'Falta o evento.'], 400);
    $pdo->prepare('DELETE FROM lg_presencas WHERE utilizador_id = ? AND pg = ?')->execute([$u['id'], $pg]);
    if (in_array($e, ['vou', 'fui'], true)) $pdo->prepare('INSERT INTO lg_presencas (utilizador_id, pg, estado, nota, criado_em) VALUES (?,?,?,?,?)')
      ->execute([$u['id'], $pg, $e, $e === 'fui' ? max(-1, min(1, (int)($p['nota'] ?? 0))) : 0, agora()]);
    sai(['ok' => true]);
  }
  if ($acao === 'perfil') {
    $pdo->prepare('UPDATE lg_utilizadores SET nome = ?, mostrar = ? WHERE id = ?')->execute([mb_substr(trim(strip_tags((string)($p['nome'] ?? ''))), 0, 40), empty($p['mostrar']) ? 0 : 1, $u['id']]);
    sai(['ok' => true]);
  }
  if ($acao === 'amigo') { // aceitar um convite: ficam amigos dos dois lados
    $q = $pdo->prepare('SELECT * FROM lg_utilizadores WHERE codigo = ?'); $q->execute([mb_substr((string)($p['codigo'] ?? ''), 0, 12)]); $o = $q->fetch();
    if (!$o) sai(['erro' => 'Este convite não existe ou já não é válido.'], 404);
    if ((int)$o['id'] === (int)$u['id']) sai(['erro' => 'Este é o teu próprio convite: envia-o a um amigo.'], 400);
    $ins = $pdo->prepare('INSERT INTO lg_amigos (a, b, criado_em) VALUES (?,?,?)'); $ex = $pdo->prepare('SELECT 1 FROM lg_amigos WHERE a = ? AND b = ?');
    foreach ([[$u['id'], $o['id']], [$o['id'], $u['id']]] as [$x, $y]) { $ex->execute([$x, $y]); if (!$ex->fetchColumn()) $ins->execute([$x, $y, agora()]); }
    sai(['ok' => true, 'nome' => nome_curto($o)]);
  }
  if ($acao === 'tirar_amigo') {
    $o = (int)($p['id'] ?? 0);
    $pdo->prepare('DELETE FROM lg_amigos WHERE (a = ? AND b = ?) OR (a = ? AND b = ?)')->execute([$u['id'], $o, $o, $u['id']]);
    sai(['ok' => true]);
  }
  if ($acao === 'guardar') {
    $pg = mb_substr((string)($p['pg'] ?? ''), 0, 120); if ($pg === '') sai(['erro' => 'Falta o evento.'], 400);
    $pdo->prepare('DELETE FROM lg_guardados WHERE utilizador_id = ? AND pg = ?')->execute([$u['id'], $pg]);
    if (!empty($p['on'])) $pdo->prepare('INSERT INTO lg_guardados (utilizador_id, pg, criado_em) VALUES (?,?,?)')->execute([$u['id'], $pg, agora()]);
    sai(['ok' => true]);
  }
  if ($acao === 'juntar') { // os guardados deste aparelho passam para a conta
    $ins = $pdo->prepare('INSERT INTO lg_guardados (utilizador_id, pg, criado_em) VALUES (?,?,?)'); $ex = $pdo->prepare('SELECT 1 FROM lg_guardados WHERE utilizador_id = ? AND pg = ?');
    foreach (array_slice((array)($p['guardados'] ?? []), 0, 500) as $pg) { $pg = mb_substr((string)$pg, 0, 120); $ex->execute([$u['id'], $pg]); if ($pg !== '' && !$ex->fetchColumn()) $ins->execute([$u['id'], $pg, agora()]); }
    sai(['ok' => true]);
  }
  if ($acao === 'sair') {
    $pdo->prepare('DELETE FROM lg_sessoes WHERE hash = ?')->execute([hash('sha256', $_COOKIE[COOKIE] ?? '')]);
    setcookie(COOKIE, '', ['expires' => time() - 3600, 'path' => $BASE, 'secure' => true, 'httponly' => true, 'samesite' => 'Lax']);
    sai(['ok' => true]);
  }
  if ($acao === 'apagar') { // apaga a conta e tudo o que está ligado a ela
    try { // as legendas que deixou (conta/legendas.php), com as fotografias
      $q = $pdo->prepare("SELECT foto FROM lg_legendas WHERE utilizador_id = ? AND foto <> ''"); $q->execute([$u['id']]);
      foreach ($q->fetchAll(PDO::FETCH_COLUMN) as $f) foreach (['', 't-'] as $p2) { @unlink(__DIR__ . "/../fotos/l/$p2$f"); foreach ([__DIR__ . '/../privado', __DIR__ . '/../../privado'] as $d) @unlink("$d/legendas/$p2$f"); }
      $pdo->prepare('DELETE FROM lg_legendas WHERE utilizador_id = ?')->execute([$u['id']]);
    } catch (Throwable $e) {} // ainda não há legendas neste servidor
    try { $pdo->prepare('DELETE FROM lg_alertas WHERE utilizador_id = ?')->execute([$u['id']]); $pdo->prepare('DELETE FROM lg_alertas_dia WHERE utilizador_id = ?')->execute([$u['id']]); } catch (Throwable $e) {} // ainda sem alertas
    foreach (['lg_guardados WHERE utilizador_id', 'lg_presencas WHERE utilizador_id', 'lg_amigos WHERE a', 'lg_amigos WHERE b', 'lg_sessoes WHERE utilizador_id', 'lg_utilizadores WHERE id'] as $t) $pdo->prepare("DELETE FROM $t = ?")->execute([$u['id']]);
    $pdo->prepare('DELETE FROM lg_links WHERE email = ?')->execute([$u['email']]);
    setcookie(COOKIE, '', ['expires' => time() - 3600, 'path' => $BASE, 'secure' => true, 'httponly' => true, 'samesite' => 'Lax']);
    sai(['ok' => true]);
  }
  sai(['erro' => 'Pedido inválido.'], 400);
} catch (Throwable $e) {
  error_log('lagenda conta: ' . $e->getMessage());
  sai(['erro' => 'Algo correu mal do nosso lado. Tenta outra vez daqui a pouco.'], 500);
}
