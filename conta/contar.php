<?php
// lagenda: contador de visitas próprio, sem cookies e sem guardar dados pessoais (plano de projeto, 4/11/2026).
// Cada página do site chama-o uma vez (navigator.sendBeacon em assets/lagenda.js) com o caminho e a origem.
// Guarda só números por dia: vistas por página, por tipo de página e por origem, e visitantes únicos.
// Visitantes únicos: um resumo (hash) do IP + navegador com um «sal» aleatório do dia; o sal é apagado ao fim de
// dois dias e os resumos também, por isso não se consegue saber quem visitou nem seguir ninguém de um dia para o outro.
// Lido pela gestão (gestao/?indicadores).
foreach ([__DIR__ . '/../privado', __DIR__ . '/../../privado'] as $d) if (is_file("$d/db.php") && (is_file("$d/config.php") || is_file(dirname((string) realpath($d), 2) . '/privado/config.php') || (is_file("$d/config_caminho.php") && (include "$d/config_caminho.php")))) { require_once "$d/db.php"; break; }
header('Cache-Control: no-store'); http_response_code(204);
if (!function_exists('bd')) exit;
$ua = (string)($_SERVER['HTTP_USER_AGENT'] ?? '');
if ($ua === '' || preg_match('/bot|crawl|spider|slurp|preview|headless|lighthouse|python|curl|wget|monitor/i', $ua)) exit;
$in = json_decode((string)file_get_contents('php://input'), true);
if (!is_array($in)) $in = $_GET;
$p = (string)($in['p'] ?? '');
if ($p === '' || $p[0] !== '/' || strlen($p) > 200) exit;
$p = preg_replace('~[?#].*$~', '', $p);
$p = preg_replace('~/index\.html$~', '/', $p);
if (!preg_match('~^/[a-z0-9/._-]*$~i', $p)) exit;
if (preg_match('~^/(conta|gestao)/~', $p)) exit;
$tipo = match (true) {
  $p === '/' => 'entrada',
  str_starts_with($p, '/e/') => 'evento',
  str_starts_with($p, '/salas') => 'sala',
  str_starts_with($p, '/artistas') => 'artista',
  str_starts_with($p, '/agenda') => 'agenda',
  str_starts_with($p, '/academia') => 'academia',
  str_starts_with($p, '/municipio') => 'municipio',
  default => 'outra',
};
$r = strtolower((string)(parse_url((string)($in['r'] ?? ''), PHP_URL_HOST) ?? ''));
$origem = match (true) {
  $r === '' => 'direto',
  (bool)preg_match('/(^|\.)lagenda\.pt$/', $r) => 'interno',
  (bool)preg_match('/google\.|bing\.|duckduckgo\.|yahoo\.|ecosia\.|qwant\./', $r) => 'pesquisa',
  (bool)preg_match('/facebook\.|instagram\.|t\.co$|twitter\.|x\.com$|whatsapp\.|linkedin\.|threads\.|tiktok\.|reddit\./', $r) => 'redes',
  (bool)preg_match('/mail\.|outlook\.|gmail\./', $r) => 'email',
  default => 'outro sítio',
};
$dia = date('Y-m-d');
try {
  $pdo = bd(); $my = $pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql'; $cs = $my ? ' DEFAULT CHARSET=utf8mb4' : '';
  foreach (['lg_vis_dia (dia CHAR(10) PRIMARY KEY, visitantes INT DEFAULT 0, vistas INT DEFAULT 0)',
            'lg_vis_pag (dia CHAR(10), pg VARCHAR(200), n INT DEFAULT 0, PRIMARY KEY (dia, pg))',
            'lg_vis_tipo (dia CHAR(10), tipo VARCHAR(12), n INT DEFAULT 0, PRIMARY KEY (dia, tipo))',
            'lg_vis_origem (dia CHAR(10), origem VARCHAR(16), n INT DEFAULT 0, PRIMARY KEY (dia, origem))',
            'lg_vis_sal (dia CHAR(10) PRIMARY KEY, sal CHAR(32))',
            'lg_vis_uni (dia CHAR(10), h CHAR(32), PRIMARY KEY (dia, h))'] as $t) $pdo->exec("CREATE TABLE IF NOT EXISTS $t$cs");
  $mais = function (string $sql, array $chave, string $ins) use ($pdo) {
    $u = $pdo->prepare($sql); $u->execute($chave);
    if (!$u->rowCount()) { try { $pdo->prepare($ins)->execute($chave); } catch (Throwable $e) { $u->execute($chave); } }
  };
  // sal do dia (criado à primeira visita do dia; o de anteontem e os resumos antigos apagam-se)
  $q = $pdo->prepare('SELECT sal FROM lg_vis_sal WHERE dia = ?'); $q->execute([$dia]); $sal = $q->fetchColumn();
  if (!$sal) {
    try { $pdo->prepare('INSERT INTO lg_vis_sal (dia, sal) VALUES (?,?)')->execute([$dia, bin2hex(random_bytes(16))]); } catch (Throwable $e) {}
    $q->execute([$dia]); $sal = (string)$q->fetchColumn();
    $ontem = date('Y-m-d', strtotime('-1 day'));
    $pdo->prepare('DELETE FROM lg_vis_sal WHERE dia < ?')->execute([$ontem]);
    $pdo->prepare('DELETE FROM lg_vis_uni WHERE dia < ?')->execute([$ontem]);
  }
  $novo = false;
  $h = substr(hash('sha256', $sal . '|' . ($_SERVER['REMOTE_ADDR'] ?? '') . '|' . $ua), 0, 32);
  try { $pdo->prepare('INSERT INTO lg_vis_uni (dia, h) VALUES (?,?)')->execute([$dia, $h]); $novo = true; } catch (Throwable $e) {}
  $u = $pdo->prepare('UPDATE lg_vis_dia SET vistas = vistas + 1, visitantes = visitantes + ? WHERE dia = ?'); $u->execute([$novo ? 1 : 0, $dia]);
  if (!$u->rowCount()) { try { $pdo->prepare('INSERT INTO lg_vis_dia (dia, visitantes, vistas) VALUES (?,?,1)')->execute([$dia, $novo ? 1 : 0]); } catch (Throwable $e) { $u->execute([$novo ? 1 : 0, $dia]); } }
  $mais('UPDATE lg_vis_pag SET n = n + 1 WHERE dia = ? AND pg = ?', [$dia, $p], 'INSERT INTO lg_vis_pag (dia, pg, n) VALUES (?,?,1)');
  $mais('UPDATE lg_vis_tipo SET n = n + 1 WHERE dia = ? AND tipo = ?', [$dia, $tipo], 'INSERT INTO lg_vis_tipo (dia, tipo, n) VALUES (?,?,1)');
  if ($origem !== 'interno') $mais('UPDATE lg_vis_origem SET n = n + 1 WHERE dia = ? AND origem = ?', [$dia, $origem], 'INSERT INTO lg_vis_origem (dia, origem, n) VALUES (?,?,1)');
} catch (Throwable $e) {}
