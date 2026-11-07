<?php
// Lykeion (4/11/2026): avisos por email das instituições e áreas seguidas, e a newsletter académica de segunda-feira.
// Quem tem conta e segue instituições ou áreas (gostos.lyk = {inst:[ids], areas:[slugs], avisos, semanal}):
//   - aviso diário: eventos novos das instituições seguidas (e das suas unidades) ou das áreas seguidas; cada evento só
//     é avisado uma vez (lg_alertas, chave «lyk|pg»); no máximo um email do Lykeion por pessoa por dia (lg_lyk_dia);
//   - à segunda de manhã: «A semana académica», os próximos 7 dias do que segue, mais as provas públicas da semana
//     (uma vez por semana, lg_lyk_dia com «s<ano-semana>»).
// Os eventos vêm de academia.json (gerado de noite pelo gerar_lagenda.py).
//   ?correr          → um lote de avisos diários (o GitHub, lykeion.yml, chama-o todas as manhãs até responder faltam: 0)
//   ?semana          → um lote da newsletter de segunda (só à segunda, a partir das 7h)
//   ?ver             → mostra o email de segunda de quem tem a sessão aberta
//   ?sair=ID&k=CHAVE → deixa de receber os emails do Lykeion
foreach ([__DIR__ . '/../privado', __DIR__ . '/../../privado'] as $d) if (is_file("$d/db.php") && (is_file("$d/config.php") || is_file(dirname((string) realpath($d), 2) . '/privado/config.php') || (is_file("$d/config_caminho.php") && (include "$d/config_caminho.php")))) { require_once "$d/db.php"; break; }
if (!function_exists('bd')) { http_response_code(503); exit('{"erro":"As contas ainda não estão ligadas neste servidor."}'); }

$URL = 'https://lykeion.pt/';      // quando houver lykeion.pt, muda aqui e em LY (lykeion.py)
$LYK = $URL;
const LOTE = 25;
const MAX_LINHAS = 25;

function ly_bd(): PDO {
  static $ok = false; $pdo = bd();
  if (!$ok) {
    $cs = $pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql' ? ' DEFAULT CHARSET=utf8mb4' : '';
    $pdo->exec("CREATE TABLE IF NOT EXISTS lg_alertas (utilizador_id INT, chave VARCHAR(190), enviado_em VARCHAR(19), PRIMARY KEY (utilizador_id, chave))$cs");
    $pdo->exec("CREATE TABLE IF NOT EXISTS lg_lyk_dia (utilizador_id INT, dia VARCHAR(10), PRIMARY KEY (utilizador_id, dia))$cs");
    $ok = true;
  }
  return $pdo;
}
function chave_sair(int $id): string { global $CFG; return substr(hash_hmac('sha256', "sair-lykeion-$id", (string)($CFG['gestao_password'] ?? 'lagenda')), 0, 20); }
function acad(): array { static $d = null; return $d ?? ($d = json_decode((string)@file_get_contents(__DIR__ . '/../academia.json'), true) ?: ['ev' => [], 'inst' => [], 'pais' => [], 'areas' => [], 'subtipos' => []]); }
function lyk(array $u): array {
  $g = json_decode($u['gostos'] ?: '{}', true) ?: [];
  $l = (array)($g['lyk'] ?? []);
  return ['inst' => array_flip((array)($l['inst'] ?? [])), 'areas' => array_flip((array)($l['areas'] ?? [])), 'listas' => (array)($l['listas'] ?? []),
          'menos' => ['tipos' => array_flip((array)($l['menos']['tipos'] ?? [])), 'inst' => array_flip((array)($l['menos']['inst'] ?? [])), 'areas' => array_flip((array)($l['menos']['areas'] ?? []))],
          'avisos' => !array_key_exists('avisos', $l) || !empty($l['avisos']), 'semanal' => !array_key_exists('semanal', $l) || !empty($l['semanal'])];
}
// a instituição do evento ou uma das suas mães é seguida? devolve a seguida, ou ''
function seguida(string $i, array $seg): string {
  $D = acad(); $n = 0;
  while ($i !== '' && $n++ < 6) { if (isset($seg[$i])) return $i; $i = (string)($D['pais'][$i] ?? ''); }
  return '';
}
// o evento cabe na lista temática (cultura/lykeion_listas.json, copiada para academia.json)? todos os filtros com «e»
function na_lista(array $e, string $slug): bool {
  $f = acad()['listas'][$slug][1] ?? null; if (!$f) return false;
  $em = fn($k, $v) => empty($f[$k]) || in_array($v, $f[$k], true);
  return $em('subtipos', $e['s'] ?? '') && $em('familias', $e['fa'] ?? '') && $em('distritos', $e['di'] ?? '') && $em('modo', $e['m'] ?? '')
    && $em('lingua', $e['li'] ?? 'pt') && (empty($f['areas']) || array_intersect((array)($e['a'] ?? []), $f['areas']))
    && (empty($f['chamada']) || (string)($e['pz'] ?? '') >= date('Y-m-d'));
}
function nome_inst(string $i): string { $D = acad(); $r = $D['inst'][$i] ?? null; return $r ? ($r[1] ?: $r[0]) : ''; }
// [chave, rótulo, dia, título, onde, url, hora] dos eventos que interessam a esta pessoa, de hoje até $ate
function escolhidos(array $u, string $ate = '', bool $so_novos = true): array {
  global $URL; $L = lyk($u); if (!$L['inst'] && !$L['areas'] && !$L['listas']) return [];
  $D = acad(); $hoje = date('Y-m-d'); $AREA = array_column($D['areas'], 1, 0) + array_column($D['finas'] ?? [], 1, 0);
  $ja = [];
  if ($so_novos) { $q = ly_bd()->prepare("SELECT chave FROM lg_alertas WHERE utilizador_id = ? AND chave LIKE 'lyk|%'"); $q->execute([$u['id']]); $ja = array_flip($q->fetchAll(PDO::FETCH_COLUMN)); }
  $r = [];
  foreach ($D['ev'] as $e) {
    // «menos disto» (7/11/2026): o que a pessoa disse que não quer ver ganha sempre
    if (isset($L['menos']['tipos'][$e['s'] ?? '']) || seguida((string)($e['in'] ?? ''), $L['menos']['inst']) !== ''
        || array_filter(array_merge((array)($e['af'] ?? []), (array)($e['a'] ?? [])), fn($x) => isset($L['menos']['areas'][$x]))) continue;
    $s = seguida((string)($e['in'] ?? ''), $L['inst']);
    // áreas largas («Ciências Sociais») e finas («Sociologia»: todos os eventos dos centros da lista da APS, 6/11/2026)
    $a = $s ? '' : (string)(array_values(array_filter(array_merge((array)($e['af'] ?? []), (array)($e['a'] ?? [])), fn($x) => isset($L['areas'][$x])))[0] ?? '');
    $li = ($s || $a) ? '' : (string)(array_values(array_filter($L['listas'], fn($x) => na_lista($e, $x)))[0] ?? '');
    if (!$s && !$a && !$li) continue;
    $dias = array_values(array_filter((array)$e['d'], fn($d) => $d >= $hoje && (!$ate || $d <= $ate))); if (!$dias) continue;
    $k = 'lyk|' . $e['pg']; if (isset($ja[$k])) continue;
    $rot = $s ? nome_inst($s) : ($a ? ($AREA[$a] ?? $a) : (string)($D['listas'][$li][0] ?? $li));
    $r[] = [$k, $rot, $dias[0], $e['n'], trim(($e['in'] ? nome_inst($e['in']) : $e['l']) . ' · ' . ($e['o'] ?? ''), ' ·'), $URL . 'e/' . $e['pg'] . '.html', hora((string)($e['h'] ?? ''), $dias[0])];
  }
  usort($r, fn($a, $b) => strcmp($a[2] . $a[3], $b[2] . $b[3]));
  return $r;
}
function provas_semana(string $ate): array {
  global $URL; $D = acad(); $hoje = date('Y-m-d'); $r = [];
  foreach ($D['ev'] as $e) {
    if (empty($e['so'])) continue;
    $dias = array_values(array_filter((array)$e['d'], fn($d) => $d >= $hoje && $d <= $ate)); if (!$dias) continue;
    $r[] = ['', 'Provas públicas', $dias[0], $e['n'], trim(($e['in'] ? nome_inst($e['in']) : $e['l']) . ' · ' . ($e['o'] ?? ''), ' ·'), $URL . 'e/' . $e['pg'] . '.html', hora((string)($e['h'] ?? ''), $dias[0])];
  }
  usort($r, fn($a, $b) => strcmp($a[2], $b[2]));
  return $r;
}
function hora(string $h, string $dia): string {
  if (preg_match('/(\d{1,2})h(\d{2})?/', $h, $m)) return (int)$m[1] . 'h' . (($m[2] ?? '00') !== '00' ? $m[2] : '');
  return '';
}
const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const SEM = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
function dia_txt(string $d): string { $t = strtotime($d); return SEM[(int)date('w', $t)] . ' ' . (int)date('j', $t) . ' ' . MES[(int)date('n', $t) - 1]; }

function tabela(array $linhas, string &$txt): string {
  $h = fn($s) => htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8'); $tab = '';
  foreach (array_slice($linhas, 0, MAX_LINHAS) as [$k, $rot, $d, $tit, $onde, $url, $hr]) {
    $txt .= "• $rot — " . dia_txt($d) . ($hr ? " · $hr" : '') . " — $tit, $onde\n  $url\n";
    $tab .= '<tr><td style="padding:10px 14px 10px 0;vertical-align:top;width:70px;font:400 26px/1 Georgia,serif;color:#1D2A23">' . (int)date('j', strtotime($d))
      . '<div style="font:500 11px/1.4 Menlo,monospace;color:#B4532A;text-transform:uppercase">' . MES[(int)date('n', strtotime($d)) - 1] . ' · ' . SEM[(int)date('w', strtotime($d))] . '</div></td>'
      . '<td style="padding:10px 0;vertical-align:top"><div style="font:500 12px/1.4 Menlo,monospace;color:#2F5D46">' . $h($rot) . '</div>'
      . '<a href="' . $h($url) . '" style="font:600 17px/1.3 Georgia,serif;color:#1D2A23;text-decoration:none">' . $h($tit) . '</a>'
      . '<div style="font:14px/1.4 Arial,sans-serif;color:#5E6A62">' . $h($onde) . ($hr ? ' · ' . $h($hr) : '') . '</div></td></tr>';
  }
  return '<table cellpadding="0" cellspacing="0" style="width:100%">' . $tab . '</table>';
}
function montar(array $u, string $titulo, array $blocos): array {
  global $URL, $LYK; $h = fn($s) => htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8');
  $sair = $URL . 'conta/lykeion.php?sair=' . $u['id'] . '&k=' . chave_sair((int)$u['id']);
  $txt = "$titulo\n\n"; $corpo = '';
  foreach ($blocos as [$sub, $linhas]) { if (!$linhas) continue; $txt .= "$sub\n"; $corpo .= '<h2 style="font:400 19px/1.3 Georgia,serif;margin:22px 0 4px">' . $h($sub) . '</h2>' . tabela($linhas, $txt); $txt .= "\n"; }
  $txt .= "Instituições e áreas que segue: {$URL}conta.html#lykeion\nDeixar de receber: $sair\n";
  $html = '<!doctype html><html lang="pt-PT"><body style="margin:0;background:#F3EFE6"><div style="max-width:600px;margin:0 auto;padding:24px 18px;font:15px/1.5 Arial,sans-serif;color:#1D2A23">'
    . '<div style="font:400 30px Georgia,serif"><a href="' . $h($LYK) . '" style="color:#1D2A23;text-decoration:none;border-bottom:3px solid #B4532A">Lykeion</a></div>'
    . '<h1 style="font:400 24px/1.25 Georgia,serif;margin:18px 0 6px">' . $h($titulo) . '</h1>' . $corpo
    . '<p style="color:#5E6A62;font-size:12px;margin-top:30px">Recebe este email porque segue instituições ou áreas no Lykeion, a agenda da ciência do país (um projeto da Lagenda). '
    . '<a href="' . $h($URL . 'conta.html#lykeion') . '" style="color:#5E6A62">Mudar o que segue</a> · <a href="' . $h($sair) . '" style="color:#5E6A62">Deixar de receber</a></p>'
    . '</div></body></html>';
  return [$txt, $html, $sair];
}
function semanal(array $u): ?array {
  $ate = date('Y-m-d', time() + 7 * 86400);
  $seus = escolhidos($u, $ate, false); $provas = provas_semana($ate);
  if (!$seus && !$provas) return null;
  $titulo = 'A semana académica: ' . ($seus ? count($seus) . ' ' . (count($seus) === 1 ? 'evento' : 'eventos') . ' do que segue' : 'as provas públicas');
  return [$titulo, montar($u, $titulo, [['Do que segue', $seus], ['Provas públicas da semana', array_slice($provas, 0, 15)]])];
}
function sessao(): ?array {
  $t = $_COOKIE['lagenda_sessao'] ?? ''; if (strlen($t) < 40) return null;
  $q = bd()->prepare('SELECT u.* FROM lg_sessoes s JOIN lg_utilizadores u ON u.id = s.utilizador_id WHERE s.hash = ?'); $q->execute([hash('sha256', $t)]);
  return $q->fetch() ?: null;
}
function lote(string $dia, callable $fazer): array {
  $pdo = ly_bd();
  try { $pdo->query('SELECT 1 FROM lg_utilizadores LIMIT 1'); } catch (Throwable $e) { return ['enviados' => 0, 'faltam' => 0, 'nota' => 'ainda não há contas']; }
  $sel = "FROM lg_utilizadores u WHERE u.gostos LIKE '%\"lyk\":%' AND NOT EXISTS (SELECT 1 FROM lg_lyk_dia a WHERE a.utilizador_id = u.id AND a.dia = ?)";
  $q = $pdo->prepare("SELECT u.* $sel ORDER BY u.id LIMIT " . LOTE); $q->execute([$dia]); $env = 0; $erros = 0;
  $marca = $pdo->prepare('INSERT INTO lg_lyk_dia (utilizador_id, dia) VALUES (?,?)');
  foreach ($q->fetchAll() as $u) {
    try { $marca->execute([$u['id'], $dia]); } catch (Throwable $x) { continue; }
    $r = $fazer($u); if ($r === null) continue;
    if ($r === false) { $erros++; $pdo->prepare('DELETE FROM lg_lyk_dia WHERE utilizador_id = ? AND dia = ?')->execute([$u['id'], $dia]); continue; }
    $env++;
  }
  $f = $pdo->prepare("SELECT COUNT(*) $sel"); $f->execute([$dia]);
  return ['enviados' => $env, 'erros' => $erros, 'faltam' => $erros ? 0 : (int)$f->fetchColumn()];
}

try {
  if (isset($_GET['sair'])) {
    $id = (int)$_GET['sair'];
    if (hash_equals(chave_sair($id), (string)($_GET['k'] ?? ''))) {
      $q = bd()->prepare('SELECT gostos FROM lg_utilizadores WHERE id = ?'); $q->execute([$id]); $g = json_decode((string)$q->fetchColumn() ?: '{}', true) ?: [];
      $g['lyk'] = array_merge((array)($g['lyk'] ?? []), ['avisos' => false, 'semanal' => false]);
      bd()->prepare('UPDATE lg_utilizadores SET gostos = ? WHERE id = ?')->execute([json_encode($g, JSON_UNESCAPED_UNICODE), $id]);
    }
    if ($_SERVER['REQUEST_METHOD'] === 'POST') exit;
    header('Content-Type: text/html; charset=utf-8');
    exit('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><body style="font:16px/1.5 Arial,sans-serif;max-width:560px;margin:40px auto;padding:0 16px;color:#1D2A23"><h1 style="font:400 26px Georgia,serif">Feito</h1><p>Deixou de receber os emails do Lykeion. Pode voltar a ligá-los na <a href="' . htmlspecialchars($URL) . 'conta.html#lykeion">sua conta</a>.</p></body>');
  }
  if (isset($_GET['ver'])) {
    header('Content-Type: text/html; charset=utf-8'); $u = sessao();
    if (!$u) exit('<!doctype html><meta charset="utf-8"><p style="font:16px Arial;margin:40px">Entre primeiro na sua conta.</p>');
    $s = semanal($u);
    exit($s ? $s[1][1] : '<!doctype html><meta charset="utf-8"><p style="font:16px Arial;margin:40px">Ainda não segue instituições nem áreas, ou não há nada nos próximos 7 dias.</p>');
  }
  header('Content-Type: application/json; charset=utf-8'); header('Cache-Control: no-store');
  if (isset($_GET['correr'])) {
    $avisado = ly_bd()->prepare('INSERT INTO lg_alertas (utilizador_id, chave, enviado_em) VALUES (?,?,?)');
    exit(json_encode(lote(date('Y-m-d'), function ($u) use ($avisado) {
      if (!lyk($u)['avisos']) return null;
      $ls = escolhidos($u, date('Y-m-d', time() + 30 * 86400)); if (!$ls) return null;  // só o próximo mês
      $rots = array_values(array_unique(array_column($ls, 1)));
      $titulo = (count($rots) === 1 ? $rots[0] : $rots[0] . (count($rots) === 2 ? ' e ' . $rots[1] : ' e outros')) . ': ' . (count($ls) === 1 ? 'um evento novo' : count($ls) . ' eventos novos');
      [$txt, $html, $sair] = montar($u, $titulo, [['', $ls]]);
      [$ok] = enviar_email($u['email'], $titulo, $txt, '', 'Lykeion', $html, "List-Unsubscribe: <$sair>\r\nList-Unsubscribe-Post: List-Unsubscribe=One-Click\r\n");
      if (!$ok) return false;
      $agora = date('Y-m-d H:i:s'); foreach ($ls as $x) try { $avisado->execute([$u['id'], $x[0], $agora]); } catch (Throwable $e) {}
      return true;
    })));
  }
  if (isset($_GET['semana'])) {
    if ((int)date('N') !== 1 || (int)date('G') < 7) exit('{"enviados":0,"faltam":0,"nota":"só à segunda, a partir das 7h"}');
    exit(json_encode(lote('s' . date('o-W'), function ($u) {
      if (!lyk($u)['semanal']) return null;
      $s = semanal($u); if (!$s) return null;
      [$titulo, [$txt, $html, $sair]] = $s;
      [$ok] = enviar_email($u['email'], $titulo, $txt, '', 'Lykeion', $html, "List-Unsubscribe: <$sair>\r\nList-Unsubscribe-Post: List-Unsubscribe=One-Click\r\n");
      return $ok ? true : false;
    })));
  }
  http_response_code(400); echo '{"erro":"Pedido inválido."}';
} catch (Throwable $e) {
  error_log('lykeion: ' . $e->getMessage()); http_response_code(500); echo '{"erro":"Algo correu mal do nosso lado."}';
}
