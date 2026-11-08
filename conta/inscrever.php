<?php
// Lykeion (8/11/2026, pedido do Paulo): inscrições gratuitas nos eventos, em vez de um evento no Eventbrite a preço zero
// só para saber quantas pessoas vêm. O evento é proposto em conta/propor.php com «Quero inscrições no Lykeion».
//   GET  ?ev=ID&n                 → JSON: inscritos, lugares, se está fechado (o academia.js mostra na página do evento)
//   POST ?ev=ID                   → inscreve (nome, email, afiliação opcional); com lotação cheia, fica em lista de espera
//   GET/POST ?anular=TOKEN        → anula a inscrição (pede um clique: os leitores de email abrem as ligações sozinhos)
//   GET  ?ics=ID                  → o evento para o calendário
//   GET/POST ?org=ID&k=CHAVE      → página do organizador: lista, Excel (CSV), fechar/abrir, lotação, mensagem aos inscritos,
//                                   ligações do direto e da gravação
//   GET  ?tarefas                 → lembretes da véspera e apagar os dados 30 dias depois do evento (também corre sozinho)
// RGPD: o organizador é o responsável; o Lykeion guarda por ele (subcontratante) só nome, email e afiliação, só nesta base
// de dados (nunca no GitHub), e apaga tudo 30 dias depois do evento. Nada é pago, nunca.
foreach ([__DIR__ . '/../privado', __DIR__ . '/../../privado'] as $d) if (is_file("$d/db.php") && (is_file("$d/config.php") || is_file(dirname((string) realpath($d), 2) . '/privado/config.php') || (is_file("$d/config_caminho.php") && (include "$d/config_caminho.php")))) { require_once "$d/db.php"; require_once "$d/github.php"; break; }
if (!function_exists('bd')) { http_response_code(503); exit('As contas ainda não estão ligadas neste servidor.'); }
$URL = 'https://lykeion.pt/';  // o gerar_lagenda.py troca para https://lykeion.pt/ na cópia do Lykeion
const CSV_PROP = 'cultura/lykeion_propostas.csv';
const COLS = ['enviado_em', 'id', 'instituicao', 'titulo', 'subtipo', 'data_inicio', 'data_fim', 'hora', 'local', 'concelho', 'url', 'modo', 'prazo', 'descricao', 'quem',
              'inscricoes', 'lotacao', 'direto', 'gravacao', 'acess', 'lingua'];
const DIAS_GUARDAR = 30;      // apagar os dados 30 dias depois do evento
const MAX_DIA_IP = 20;        // inscrições por dia e por endereço (contra o lixo)
const MAX_MENSAGENS_DIA = 3;  // mensagens do organizador aos inscritos, por evento e por dia

date_default_timezone_set('Europe/Lisbon');
function ib(): PDO {
  static $ok = false; $pdo = bd();
  if (!$ok) {
    $cs = $pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql' ? ' DEFAULT CHARSET=utf8mb4' : '';
    $pdo->exec("CREATE TABLE IF NOT EXISTS lg_propostas (id VARCHAR(16) PRIMARY KEY, dados TEXT, email VARCHAR(190), ip VARCHAR(64), estado VARCHAR(12), criado_em VARCHAR(19))$cs");
    $pdo->exec("CREATE TABLE IF NOT EXISTS lg_inscricoes (tok VARCHAR(32) PRIMARY KEY, ev VARCHAR(16), nome VARCHAR(120), email VARCHAR(190), afil VARCHAR(120), estado VARCHAR(10), criado_em VARCHAR(19), lembrado INT DEFAULT 0, ip VARCHAR(64))$cs");
    $pdo->exec("CREATE TABLE IF NOT EXISTS lg_insc_meta (chave VARCHAR(64) PRIMARY KEY, valor TEXT)$cs");
    $ok = true;
  }
  return $pdo;
}
function segredo(): string { global $CFG; return (string)($CFG['gestao_password'] ?? ''); }
function chave_org(string $id): string { return substr(hash_hmac('sha256', "lykeion-org|$id", segredo()), 0, 20); }
function link_org(string $id): string { global $URL; return $URL . 'conta/inscrever.php?org=' . rawurlencode($id) . '&k=' . chave_org($id); }
function meta(string $k, ?string $v = null): string {
  if ($v === null) { $q = ib()->prepare('SELECT valor FROM lg_insc_meta WHERE chave = ?'); $q->execute([$k]); return (string)$q->fetchColumn(); }
  ib()->prepare('DELETE FROM lg_insc_meta WHERE chave = ?')->execute([$k]);
  ib()->prepare('INSERT INTO lg_insc_meta (chave, valor) VALUES (?,?)')->execute([$k, $v]); return $v;
}
function evento(string $id): ?array {  // a proposta (lg_propostas), com o email do organizador
  $q = ib()->prepare('SELECT dados, email, estado FROM lg_propostas WHERE id = ?'); $q->execute([mb_substr($id, 0, 16)]); $r = $q->fetch(PDO::FETCH_ASSOC);
  if (!$r) return null;
  $v = json_decode((string)$r['dados'], true) ?: []; $v['_email'] = (string)$r['email']; $v['_estado'] = (string)$r['estado']; $v['id'] = $v['id'] ?? $id;
  return $v;
}
function guardar_evento(array $v): void {
  $d = array_filter($v, fn($k) => $k[0] !== '_', ARRAY_FILTER_USE_KEY);
  ib()->prepare('UPDATE lg_propostas SET dados = ? WHERE id = ?')->execute([json_encode($d, JSON_UNESCAPED_UNICODE), $v['id']]);
}
function contar(string $id): array {
  $q = ib()->prepare("SELECT estado, COUNT(*) n FROM lg_inscricoes WHERE ev = ? GROUP BY estado"); $q->execute([$id]);
  $c = ['ok' => 0, 'espera' => 0]; foreach ($q->fetchAll(PDO::FETCH_ASSOC) as $r) if (isset($c[$r['estado']])) $c[$r['estado']] = (int)$r['n'];
  return $c;
}
function lotacao(array $v): int { return max(0, (int)($v['lotacao'] ?? 0)); }
function quando(array $v): string {
  $M = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  $f = fn($d) => (int)substr($d, 8, 2) . ' de ' . $M[(int)substr($d, 5, 2) - 1] . ' de ' . substr($d, 0, 4);
  $s = $f($v['data_inicio']); if (!empty($v['data_fim']) && $v['data_fim'] !== $v['data_inicio']) $s .= ' a ' . $f($v['data_fim']);
  return $s . (!empty($v['hora']) ? ', às ' . $v['hora'] : '');
}
function onde(array $v): string { return implode(', ', array_filter([(string)($v['local'] ?? ''), (string)($v['concelho'] ?? '')])); }
function pagina_evento(string $id): string {  // a página do evento no Lykeion (academia.json traz «ins» = id da proposta)
  global $URL; static $D = null;
  $D = $D ?? (json_decode((string)@file_get_contents(__DIR__ . '/../academia.json'), true) ?: ['ev' => []]);
  foreach ((array)($D['ev'] ?? []) as $e) if (($e['ins'] ?? '') === $id) return $URL . 'e/' . $e['pg'] . '.html';
  return '';
}
function resumo(array $v): string {
  return "{$v['titulo']}\n" . quando($v) . "\n" . onde($v) . "\n" . (pagina_evento($v['id']) ?: (string)($v['url'] ?? '')) . "\n";
}
function enviar(string $para, string $assunto, string $texto, string $responder = ''): bool {
  global $CFG; try { [$ok] = enviar_email($para, $assunto, $texto, $responder, 'Lykeion'); return (bool)$ok; } catch (Throwable $e) { error_log('lykeion inscrever: ' . $e->getMessage()); return false; }
}
function email_inscrito(array $v, array $r, string $tipo): void {
  global $URL;
  $anular = $URL . 'conta/inscrever.php?anular=' . $r['tok']; $ics = $URL . 'conta/inscrever.php?ics=' . rawurlencode($v['id']);
  $ola = 'Olá' . ($r['nome'] ? ' ' . explode(' ', trim($r['nome']))[0] : '') . ",\n\n";
  $fim = "\nPara anular a inscrição: $anular\n\nOs seus dados vão só para o organizador deste evento e são apagados " . DIAS_GUARDAR . " dias depois dele.\n\nLykeion · O encontro da ciência\n";
  if ($tipo === 'ok') enviar($r['email'], 'Inscrição confirmada: ' . mb_substr($v['titulo'], 0, 90), $ola . "A sua inscrição está feita:\n\n" . resumo($v) . "\nPara pôr no seu calendário: $ics\nNa véspera mandamos um lembrete.\n" . $fim, $v['_email']);
  elseif ($tipo === 'espera') enviar($r['email'], 'Lista de espera: ' . mb_substr($v['titulo'], 0, 90), $ola . "O evento está cheio e a sua inscrição ficou em lista de espera:\n\n" . resumo($v) . "\nSe abrir um lugar, passa a ter lugar e avisamos por email.\n" . $fim, $v['_email']);
  elseif ($tipo === 'subiu') enviar($r['email'], 'Abriu um lugar: ' . mb_substr($v['titulo'], 0, 90), $ola . "Abriu um lugar e a sua inscrição passou da lista de espera para confirmada:\n\n" . resumo($v) . "\nPara pôr no seu calendário: $ics\nSe já não puder ir, anule para o lugar passar a outra pessoa.\n" . $fim, $v['_email']);
  elseif ($tipo === 'lembrete') enviar($r['email'], 'Amanhã: ' . mb_substr($v['titulo'], 0, 90), $ola . "Lembramos que amanhã há:\n\n" . resumo($v) . "\nSe já não puder ir, anule para o lugar passar a outra pessoa.\n" . $fim, $v['_email']);
}
function subir_espera(array $v): void {  // um lugar livre passa ao primeiro da lista de espera
  $lot = lotacao($v); if (!$lot) return;
  while (contar($v['id'])['ok'] < $lot) {
    $q = ib()->prepare("SELECT * FROM lg_inscricoes WHERE ev = ? AND estado = 'espera' ORDER BY criado_em LIMIT 1"); $q->execute([$v['id']]); $r = $q->fetch(PDO::FETCH_ASSOC);
    if (!$r) return;
    ib()->prepare("UPDATE lg_inscricoes SET estado = 'ok' WHERE tok = ?")->execute([$r['tok']]);
    email_inscrito($v, $r, 'subiu');
  }
}
function tarefas(bool $forcar = false): string {  // lembretes da véspera e limpeza; no máximo de 20 em 20 minutos
  if (!$forcar && time() - (int)meta('tarefas') < 1200) return "Feito há pouco.\n";
  meta('tarefas', (string)time());
  $amanha = date('Y-m-d', strtotime('+1 day')); $n = 0; $apagados = 0;
  $q = ib()->query("SELECT DISTINCT ev FROM lg_inscricoes WHERE estado = 'ok' AND lembrado = 0");
  foreach ($q->fetchAll(PDO::FETCH_COLUMN) as $id) {
    $v = evento((string)$id); if (!$v || ($v['data_inicio'] ?? '') !== $amanha || !empty($v['cancelado'])) continue;
    $r2 = ib()->prepare("SELECT * FROM lg_inscricoes WHERE ev = ? AND estado = 'ok' AND lembrado = 0"); $r2->execute([$id]);
    foreach ($r2->fetchAll(PDO::FETCH_ASSOC) as $r) { email_inscrito($v, $r, 'lembrete'); ib()->prepare('UPDATE lg_inscricoes SET lembrado = 1 WHERE tok = ?')->execute([$r['tok']]); $n++; }
  }
  $limite = date('Y-m-d', strtotime('-' . DIAS_GUARDAR . ' days'));
  foreach (ib()->query('SELECT DISTINCT ev FROM lg_inscricoes')->fetchAll(PDO::FETCH_COLUMN) as $id) {
    $v = evento((string)$id); $fim = $v ? (string)($v['data_fim'] ?: $v['data_inicio']) : '';
    if (!$v || $fim < $limite) { $d = ib()->prepare('DELETE FROM lg_inscricoes WHERE ev = ?'); $d->execute([$id]); $apagados += $d->rowCount(); }
  }
  return "Lembretes enviados: $n. Inscrições apagadas (mais de " . DIAS_GUARDAR . " dias depois do evento): $apagados.\n";
}
function linha_csv(array $v): string { return implode(';', array_map(fn($c) => preg_match('/[;"\r\n]/', (string)($v[$c] ?? '')) ? '"' . str_replace('"', '""', (string)$v[$c]) . '"' : (string)($v[$c] ?? ''), COLS)); }
function csv_atualizar(string $id, array $campos): void {  // muda campos de uma linha do CSV das propostas (direto, gravação)
  gh_gravar([], 'Lykeion: organizador atualizou o evento ' . $id, function () use ($id, $campos) {
    $txt = gh_ler(CSV_PROP); $f = fopen('php://memory', 'r+'); fwrite($f, $txt); rewind($f);
    $cab = fgetcsv($f, 0, ';', '"', ''); $linhas = [];
    while (($r = fgetcsv($f, 0, ';', '"', '')) !== false) { if ($r === [null]) continue; $linhas[] = array_combine(array_slice($cab, 0, count($r)), array_slice(array_pad($r, count($cab), ''), 0, count($cab))) ?: []; }
    $out = implode(';', COLS) . "\n";
    foreach ($linhas as $l) { if (($l['id'] ?? '') === $id) $l = array_merge($l, $campos); $out .= linha_csv($l) . "\n"; }
    return [CSV_PROP => $out];
  });
}
$h = fn($s) => htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8');
function topo(string $titulo): string {
  global $URL;
  return '<!doctype html><html lang="pt-PT"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>' . htmlspecialchars($titulo) . ' · Lykeion</title>'
    . '<link rel="icon" href="' . $URL . 'assets/marca/lykeion/icone.svg" type="image/svg+xml"><meta name="theme-color" content="#1F4E3D">'
    . '<link rel="stylesheet" href="' . $URL . 'assets/fontes.css"><link rel="stylesheet" href="' . $URL . 'assets/lagenda.css"><link rel="stylesheet" href="' . $URL . 'assets/lykeion.css">'
    . '<style>.lyk-form label{display:block;margin:14px 0 4px;font-weight:600}.lyk-form input:not([type=checkbox]),.lyk-form textarea{font:inherit;width:100%;box-sizing:border-box;padding:.6rem .7rem;border:1px solid var(--linha);border-radius:8px;background:var(--papel);color:var(--tinta)}'
    . '.lyk-form table{border-collapse:collapse;width:100%;font-size:14px}.lyk-form td,.lyk-form th{border-bottom:1px solid var(--linha);padding:6px 4px;text-align:left;vertical-align:top}.lyk-num{display:flex;gap:24px;flex-wrap:wrap;margin:12px 0}.lyk-num b{display:block;font-size:2rem}'
    . '.lyk-form fieldset{border:1px solid var(--linha);border-radius:10px;padding:4px 14px 14px;margin:18px 0}.lyk-tab{overflow-x:auto}</style></head>'
    . '<body class="lyk"><header class="barra lyk-barra"><div class="mol bin"><a class="marca lyk-marca" href="' . $URL . '">' . (@file_get_contents(__DIR__ . '/../assets/marca/lykeion/cabecalho.svg') ?: 'Lykeion') . '</a></div></header>'
    . '<main><div class="mol lyk-form" style="max-width:820px;padding-block:1.4rem 2.4rem">';
}
$fim = '</div></main></body></html>';
$quer_json = str_contains((string)($_SERVER['HTTP_ACCEPT'] ?? ''), 'application/json');
function resposta(bool $ok, string $msg, int $codigo = 200) {
  global $quer_json, $fim, $h;
  http_response_code($codigo);
  if ($quer_json) { header('Content-Type: application/json; charset=utf-8'); exit(json_encode(['ok' => $ok, 'msg' => $msg], JSON_UNESCAPED_UNICODE)); }
  exit(topo('Inscrição') . '<p style="font-size:1.1rem">' . $h($msg) . '</p><p><a href="javascript:history.back()">Voltar</a></p>' . $fim);
}

try {
  header('Cache-Control: no-store'); header('X-Robots-Tag: noindex');
  $id = mb_substr((string)($_GET['ev'] ?? $_GET['org'] ?? $_GET['ics'] ?? ''), 0, 16);

  // ---- tarefas (lembretes e limpeza): chamadas pelo vigia do servidor e, de passagem, por quem abre uma página ----
  if (isset($_GET['tarefas'])) { header('Content-Type: text/plain; charset=utf-8'); exit(tarefas()); }

  // ---- contagem para a página do evento ----
  if (isset($_GET['n'])) {
    header('Content-Type: application/json; charset=utf-8'); header('Access-Control-Allow-Origin: *');
    $v = evento($id);
    if (!$v || empty($v['inscricoes'])) exit(json_encode(['ok' => false]));
    $c = contar($id); $lot = lotacao($v);
    echo json_encode(['ok' => true, 'n' => $c['ok'], 'espera' => $c['espera'], 'lot' => $lot, 'restam' => $lot ? max(0, $lot - $c['ok']) : null,
                      'fechado' => !empty($v['fechado']) || !empty($v['cancelado']) || ($v['data_fim'] ?: $v['data_inicio']) < date('Y-m-d'), 'cancelado' => !empty($v['cancelado'])]);
    if (function_exists('fastcgi_finish_request')) fastcgi_finish_request();
    try { tarefas(); } catch (Throwable $e) { error_log('lykeion tarefas: ' . $e->getMessage()); }
    exit;
  }

  // ---- o evento para o calendário ----
  if (isset($_GET['ics'])) {
    $v = evento($id); if (!$v) { http_response_code(404); exit('Não encontrei o evento.'); }
    $esc = fn($s) => str_replace(["\\", ";", ",", "\n"], ["\\\\", "\\;", "\\,", "\\n"], (string)$s);
    $d = str_replace('-', '', $v['data_inicio']); $df = str_replace('-', '', $v['data_fim'] ?: $v['data_inicio']);
    if (!empty($v['hora'])) { $ini = 'DTSTART;TZID=Europe/Lisbon:' . $d . 'T' . str_replace(':', '', $v['hora']) . '00'; $fimd = 'DTEND;TZID=Europe/Lisbon:' . $df . 'T' . date('Hi', strtotime($v['hora'] . ' +2 hours')) . '00'; }
    else { $ini = "DTSTART;VALUE=DATE:$d"; $fimd = 'DTEND;VALUE=DATE:' . date('Ymd', strtotime(($v['data_fim'] ?: $v['data_inicio']) . ' +1 day')); }
    header('Content-Type: text/calendar; charset=utf-8'); header('Content-Disposition: attachment; filename="evento.ics"');
    exit(implode("\r\n", ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Lykeion//PT', 'BEGIN:VEVENT', 'UID:insc-' . $v['id'] . '@lykeion.pt', 'DTSTAMP:' . gmdate('Ymd\THis\Z'), $ini, $fimd,
      'SUMMARY:' . $esc($v['titulo']), 'LOCATION:' . $esc(onde($v)), 'URL:' . (pagina_evento($v['id']) ?: (string)$v['url']), 'END:VEVENT', 'END:VCALENDAR']) . "\r\n");
  }

  // ---- anular (com um clique de confirmação) ----
  if (isset($_GET['anular'])) {
    header('Content-Type: text/html; charset=utf-8');
    $tok = preg_replace('/[^a-f0-9]/', '', (string)$_GET['anular']);
    $q = ib()->prepare('SELECT * FROM lg_inscricoes WHERE tok = ?'); $q->execute([$tok]); $r = $q->fetch(PDO::FETCH_ASSOC);
    if (!$r) exit(topo('Anular') . '<p>Esta inscrição já não existe (foi anulada ou o evento já passou há mais de ' . DIAS_GUARDAR . ' dias).</p>' . $fim);
    $v = evento($r['ev']) ?? ['titulo' => '', 'id' => $r['ev'], 'data_inicio' => '', '_email' => ''];
    if ($r['estado'] === 'anulada') exit(topo('Anular') . '<p>A inscrição em <b>' . $h($v['titulo']) . '</b> já estava anulada.</p>' . $fim);
    if ($_SERVER['REQUEST_METHOD'] !== 'POST')
      exit(topo('Anular') . '<h1>Anular a inscrição</h1><p><b>' . $h($v['titulo']) . '</b><br>' . $h(quando($v)) . '</p><form method="post"><button class="bt prim">Sim, anular</button></form>' . $fim);
    ib()->prepare("UPDATE lg_inscricoes SET estado = 'anulada', nome = '', afil = '' WHERE tok = ?")->execute([$tok]);
    if (!empty($v['titulo'])) subir_espera($v);
    exit(topo('Anular') . '<p>Anulada. Obrigado por avisar: o lugar fica para outra pessoa.</p>' . $fim);
  }

  // ---- página do organizador ----
  if (isset($_GET['org'])) {
    header('Content-Type: text/html; charset=utf-8');
    if (segredo() === '' || !hash_equals(chave_org($id), (string)($_GET['k'] ?? ''))) { http_response_code(403); exit(topo('Organizador') . '<p>Este link não é válido.</p>' . $fim); }
    $v = evento($id); if (!$v) exit(topo('Organizador') . '<p>Não encontrei o evento.</p>' . $fim);
    $msg = '';
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
      $a = (string)($_POST['acao'] ?? '');
      if ($a === 'abrir_insc') { $v['inscricoes'] = '1'; unset($v['fechado']); guardar_evento($v); csv_atualizar($id, ['inscricoes' => '1']); $msg = 'As inscrições estão abertas. O botão aparece na página do evento daqui a uns minutos.'; }
      elseif ($a === 'fechar') { $v['fechado'] = 1; guardar_evento($v); $msg = 'Inscrições fechadas.'; }
      elseif ($a === 'abrir') { unset($v['fechado']); guardar_evento($v); $msg = 'Inscrições abertas.'; }
      elseif ($a === 'lotacao') { $v['lotacao'] = (string)max(0, min(100000, (int)($_POST['lotacao'] ?? 0))); guardar_evento($v); subir_espera($v); $msg = 'Lotação guardada.'; }
      elseif ($a === 'ligacoes') {
        $c = [];
        foreach (['direto', 'gravacao'] as $k) { $u = trim((string)($_POST[$k] ?? '')); if ($u === '' || (preg_match('#^https?://[^\s/]+\.[^\s]+$#i', $u) && strlen($u) <= 400)) { $c[$k] = $u; $v[$k] = $u; } }
        guardar_evento($v); csv_atualizar($id, $c); $msg = 'Guardado. Aparece no Lykeion daqui a uns minutos.';
      } elseif ($a === 'mensagem' || $a === 'cancelar') {
        $hoje = date('Y-m-d'); $n_hoje = (int)($v['msgs'][$hoje] ?? 0);
        $assunto = mb_substr(trim(strip_tags((string)($_POST['assunto'] ?? ''))), 0, 120); $texto = mb_substr(trim(strip_tags((string)($_POST['texto'] ?? ''))), 0, 4000);
        if ($a === 'cancelar') { $assunto = 'Cancelado: ' . $v['titulo']; $texto = "O organizador cancelou este evento.\n\n" . ($texto ? $texto . "\n" : ''); }
        if ($n_hoje >= MAX_MENSAGENS_DIA) $msg = 'Já enviou ' . MAX_MENSAGENS_DIA . ' mensagens hoje. Pode enviar mais amanhã.';
        elseif ($assunto === '' || $texto === '') $msg = 'Falta o assunto ou o texto.';
        else {
          $q = ib()->prepare("SELECT * FROM lg_inscricoes WHERE ev = ? AND estado IN ('ok','espera')"); $q->execute([$id]); $k = 0;
          foreach ($q->fetchAll(PDO::FETCH_ASSOC) as $r) {
            if (enviar($r['email'], mb_substr($assunto, 0, 120), "Mensagem do organizador de «{$v['titulo']}» (" . quando($v) . "):\n\n$texto\n\nPara anular a inscrição: {$GLOBALS['URL']}conta/inscrever.php?anular={$r['tok']}\n\nLykeion · O encontro da ciência\n", $v['_email'])) $k++;
          }
          $v['msgs'] = [$hoje => $n_hoje + 1]; if ($a === 'cancelar') { $v['cancelado'] = 1; $v['fechado'] = 1; }
          guardar_evento($v);
          $msg = "Enviada a $k " . ($k === 1 ? 'pessoa' : 'pessoas') . '.' . ($a === 'cancelar' ? ' O evento ficou marcado como cancelado e as inscrições fechadas. Para o tirar do Lykeion, responda a este email ou escreva para info@lykeion.pt.' : '');
        }
      }
      $v = evento($id);
    }
    $todos = ib()->prepare("SELECT * FROM lg_inscricoes WHERE ev = ? AND estado IN ('ok','espera') ORDER BY estado = 'espera', criado_em"); $todos->execute([$id]); $L = $todos->fetchAll(PDO::FETCH_ASSOC);
    if (isset($_GET['csv'])) {
      header('Content-Type: text/csv; charset=utf-8'); header('Content-Disposition: attachment; filename="inscritos-' . $id . '.csv"');
      echo "\xEF\xBB\xBF", "Nome;Email;Instituição;Estado;Inscrito em\n";
      foreach ($L as $r) echo implode(';', array_map(fn($x) => '"' . str_replace('"', '""', (string)$x) . '"', [$r['nome'], $r['email'], $r['afil'], $r['estado'] === 'ok' ? 'inscrito' : 'lista de espera', $r['criado_em']])), "\n";
      exit;
    }
    $c = contar($id); $lot = lotacao($v); $self = $h('?org=' . rawurlencode($id) . '&k=' . chave_org($id));
    $pag = pagina_evento($id);
    echo topo('Organizador'), '<p class="rot">Página do organizador · guarde este link, não o partilhe</p><h1>', $h($v['titulo']), '</h1><p>', $h(quando($v)), '<br>', $h(onde($v)), '</p>',
      $pag ? '<p><a href="' . $h($pag) . '">Ver a página do evento no Lykeion</a></p>' : '<p class="sub">' . ($v['_estado'] === 'espera' ? 'O evento está à espera de ser visto por nós antes de aparecer no Lykeion.' : 'A página do evento aparece no Lykeion daqui a uns minutos.') . '</p>',
      $msg ? '<p style="background:var(--cobalto);color:#fff;padding:8px 12px;border-radius:6px">' . $h($msg) . '</p>' : '';
    if (!empty($v['inscricoes'])) {
      echo '<div class="lyk-num"><div><b>', $c['ok'], '</b>inscritos</div>', $lot ? '<div><b>' . max(0, $lot - $c['ok']) . '</b>lugares livres de ' . $lot . '</div>' : '', $c['espera'] ? '<div><b>' . $c['espera'] . '</b>em lista de espera</div>' : '', '</div>',
        !empty($v['cancelado']) ? '<p><b>Evento cancelado.</b></p>' : '<form method="post" style="display:inline"><input type="hidden" name="acao" value="' . (!empty($v['fechado']) ? 'abrir' : 'fechar') . '"><button class="bt">' . (!empty($v['fechado']) ? 'Abrir as inscrições' : 'Fechar as inscrições') . '</button></form> ',
        '<a class="bt" href="', $self, '&amp;csv">Descarregar a lista (Excel)</a>',
        '<form method="post" style="margin-top:10px"><input type="hidden" name="acao" value="lotacao"><label>Lotação <span style="font-weight:400;color:var(--suave)">(0 = sem limite; com limite, quem vier a mais fica em lista de espera e entra sozinho quando alguém anula)</span></label>',
        '<div style="display:flex;gap:8px"><input type="number" name="lotacao" min="0" max="100000" value="', $lot, '" style="max-width:10rem"><button class="bt">Guardar</button></div></form>',
        '<h2>Inscritos</h2>', $L ? '<div class="lyk-tab"><table><tr><th>Nome</th><th>Email</th><th>Instituição</th><th></th></tr>' . implode('', array_map(fn($r) => '<tr><td>' . $h($r['nome']) . '</td><td>' . $h($r['email']) . '</td><td>' . $h($r['afil']) . '</td><td>' . ($r['estado'] === 'espera' ? 'espera' : '') . '</td></tr>', $L)) . '</table></div>' : '<p class="sub">Ainda ninguém.</p>',
        '<fieldset><legend>Escrever aos inscritos</legend><p class="sub">Para uma mudança de sala, de hora ou outra informação. Vai de info@lykeion.pt e as respostas chegam ao seu email. No máximo ', MAX_MENSAGENS_DIA, ' por dia.</p>',
        '<form method="post"><input type="hidden" name="acao" value="mensagem"><label>Assunto</label><input name="assunto" maxlength="120" required><label>Texto</label><textarea name="texto" rows="5" maxlength="4000" required></textarea><p><button class="bt prim">Enviar a todos</button></p></form>',
        empty($v['cancelado']) ? '<details><summary>O evento foi cancelado</summary><form method="post" onsubmit="return confirm(\'Avisar todos os inscritos de que o evento foi cancelado?\')"><input type="hidden" name="acao" value="cancelar"><label>Uma nota <span style="font-weight:400;color:var(--suave)">(opcional: o motivo, uma nova data…)</span></label><textarea name="texto" rows="3" maxlength="4000"></textarea><p><button class="bt">Avisar que foi cancelado</button></p></form></details>' : '',
        '</fieldset>';
    } else {
      echo '<fieldset><legend>Inscrições</legend><p>Este evento não tem inscrições no Lykeion. Com elas, as pessoas inscrevem-se na página do evento, vê aqui a lista e quantos vêm, e mandamos a confirmação e um lembrete na véspera. É gratuito.</p>',
        '<form method="post"><input type="hidden" name="acao" value="abrir_insc"><button class="bt prim">Abrir inscrições</button></form></fieldset>';
    }
    echo '<fieldset><legend>Direto e gravação</legend><p class="sub">Se o evento for transmitido, ponha aqui a ligação. Depois do evento, ponha a da gravação: fica em «Ver de novo» no Lykeion.</p>',
      '<form method="post"><input type="hidden" name="acao" value="ligacoes"><label>Ligação da transmissão em direto</label><input name="direto" type="url" maxlength="400" placeholder="https://…" value="', $h($v['direto'] ?? ''), '">',
      '<label>Ligação da gravação</label><input name="gravacao" type="url" maxlength="400" placeholder="https://…" value="', $h($v['gravacao'] ?? ''), '"><p><button class="bt">Guardar</button></p></form></fieldset>',
      '<p class="sub">Os dados dos inscritos são seus: só os usamos para este evento (confirmação, lembrete e as suas mensagens) e apagamo-los ', DIAS_GUARDAR, ' dias depois dele. Não os use para outros fins sem o consentimento das pessoas. Dúvidas: info@lykeion.pt.</p>', $fim;
    exit;
  }

  // ---- inscrever ----
  if (isset($_GET['ev']) && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $v = evento($id); $P = $_POST;
    if (!$v || empty($v['inscricoes']) || $v['_estado'] !== 'publicada') resposta(false, 'Este evento não tem inscrições no Lykeion.', 404);
    if (($P['site'] ?? '') !== '' || ((int)($P['t'] ?? 0) > 0 && time() - (int)$P['t'] < 3)) resposta(false, 'Não conseguimos receber. Tente outra vez.', 400);
    if (!empty($v['cancelado'])) resposta(false, 'Este evento foi cancelado.');
    if (!empty($v['fechado']) || ($v['data_fim'] ?: $v['data_inicio']) < date('Y-m-d')) resposta(false, 'As inscrições para este evento estão fechadas.');
    $nome = mb_substr(trim(strip_tags((string)($P['nome'] ?? ''))), 0, 120); $email = mb_strtolower(trim((string)($P['email'] ?? ''))); $afil = mb_substr(trim(strip_tags((string)($P['afil'] ?? ''))), 0, 120);
    if (mb_strlen($nome) < 2) resposta(false, 'Falta o nome.', 400);
    if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 190) resposta(false, 'O email não está certo.', 400);
    if (empty($P['aceito'])) resposta(false, 'Para se inscrever, aceite que o nome e o email vão para o organizador.', 400);
    $ip = hash('sha256', ($_SERVER['REMOTE_ADDR'] ?? '') . segredo());
    $q = ib()->prepare('SELECT COUNT(*) FROM lg_inscricoes WHERE ip = ? AND criado_em >= ?'); $q->execute([$ip, date('Y-m-d 00:00:00')]);
    if ((int)$q->fetchColumn() >= MAX_DIA_IP) resposta(false, 'Recebemos muitas inscrições deste endereço hoje. Tente amanhã.', 429);
    $q = ib()->prepare("SELECT * FROM lg_inscricoes WHERE ev = ? AND email = ? AND estado IN ('ok','espera')"); $q->execute([$id, $email]);
    if ($ja = $q->fetch(PDO::FETCH_ASSOC)) { email_inscrito($v, $ja, $ja['estado']); resposta(true, 'Já tinha inscrição. Mandámos outra vez a confirmação para ' . $email . '.'); }
    $c = contar($id); $lot = lotacao($v); $estado = $lot && $c['ok'] >= $lot ? 'espera' : 'ok';
    $r = ['tok' => bin2hex(random_bytes(12)), 'ev' => $id, 'nome' => $nome, 'email' => $email, 'afil' => $afil, 'estado' => $estado, 'criado_em' => date('Y-m-d H:i:s'), 'lembrado' => 0, 'ip' => $ip];
    ib()->prepare('INSERT INTO lg_inscricoes (tok, ev, nome, email, afil, estado, criado_em, lembrado, ip) VALUES (?,?,?,?,?,?,?,?,?)')->execute(array_values($r));
    email_inscrito($v, $r, $estado);
    resposta(true, $estado === 'ok' ? "Inscrição feita. Mandámos a confirmação para $email." : "O evento está cheio: a inscrição ficou em lista de espera. Se abrir um lugar, avisamos para $email.");
  }
  http_response_code(404); header('Content-Type: text/plain; charset=utf-8'); echo 'Nada aqui.';
} catch (Throwable $e) {
  error_log('lykeion inscrever: ' . $e->getMessage());
  if (isset($quer_json) && $quer_json) { http_response_code(500); header('Content-Type: application/json; charset=utf-8'); exit(json_encode(['ok' => false, 'msg' => 'Algo correu mal do nosso lado. Tente outra vez daqui a pouco.'])); }
  http_response_code(500); echo 'Algo correu mal do nosso lado. Tente outra vez daqui a pouco, ou escreva para info@lykeion.pt.';
}
