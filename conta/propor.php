<?php
// Lykeion (4/11/2026): «Propor um evento», como no talks.cam e no idw. Grava em cultura/lykeion_propostas.csv no ramo
// fonte do GitHub; o GitHub junta-o à agenda e republica (uns 3 a 5 minutos, sem ir à internet: cultura.yml em modo rápido).
//   GET  /conta/propor.php                → formulário para qualquer pessoa
//   GET  ?i=INST                          → o mesmo, com a instituição já escolhida
//   GET  ?i=INST&k=CHAVE                  → link pessoal da instituição (sem conta nem palavra-passe): publica logo
//   POST (os mesmos endereços)            → recebe a proposta
//   GET  ?aprovar=ID&k=CHAVE              → publica uma proposta que ficou à espera (link no email da gestão)
//   GET  ?links&k=CHAVE_GESTAO            → os links pessoais de todas as instituições, para enviar
// Publica logo: com o link pessoal, ou quando a ligação é para o site da própria instituição (academia/dominios.json).
// Os outros casos ficam à espera de um clique no email da gestão (contra o lixo). Os emails de quem propõe ficam só na
// base de dados do servidor, nunca no GitHub.
foreach ([__DIR__ . '/../privado', __DIR__ . '/../../privado'] as $d) if (is_file("$d/db.php") && (is_file("$d/config.php") || is_file(dirname((string) realpath($d), 2) . '/privado/config.php') || (is_file("$d/config_caminho.php") && (include "$d/config_caminho.php")))) { require_once "$d/db.php"; require_once "$d/github.php"; break; }
if (!function_exists('bd')) { http_response_code(503); exit('As contas ainda não estão ligadas neste servidor.'); }

$URL = 'https://lykeion.pt/';  // quando houver lykeion.pt, muda aqui e no lykeion.py
const CSV_PROP = 'cultura/lykeion_propostas.csv';
const COLS = ['enviado_em', 'id', 'instituicao', 'titulo', 'subtipo', 'data_inicio', 'data_fim', 'hora', 'local', 'concelho', 'url', 'modo', 'prazo', 'descricao', 'quem',
              'inscricoes', 'lotacao', 'direto', 'gravacao', 'acess', 'lingua'];  // 8/11/2026: inscrições no Lykeion, transmissão, acessibilidade, língua
// Prazos de bolsas, prémios e concursos (8/11/2026): ?prazo, grava em cultura/lykeion_prazos.csv (página academia/prazos/)
const CSV_PRAZOS = 'cultura/lykeion_prazos.csv';
const COLS_PRAZOS = ['tipo', 'nome', 'entidade', 'prazo', 'ligacao', 'publico', 'area', 'enviado_em', 'id', 'quem'];
const TIPOS_PRAZO = [['bolsa', 'Bolsa'], ['premio', 'Prémio'], ['concurso', 'Concurso'], ['financiamento', 'Financiamento de projetos']];
const ACESS = [['lgp', 'Interpretação em língua gestual portuguesa'], ['legendas', 'Legendas'], ['mobilidade', 'Acesso para cadeira de rodas']];
const MAX_DIA_IP = 10;

function pp_bd(): PDO {
  static $ok = false; $pdo = bd();
  if (!$ok) {
    $cs = $pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql' ? ' DEFAULT CHARSET=utf8mb4' : '';
    $pdo->exec("CREATE TABLE IF NOT EXISTS lg_propostas (id VARCHAR(16) PRIMARY KEY, dados TEXT, email VARCHAR(190), ip VARCHAR(64), estado VARCHAR(12), criado_em VARCHAR(19))$cs");
    $ok = true;
  }
  return $pdo;
}
function segredo(): string { global $CFG; return (string)($CFG['gestao_password'] ?? ''); }
function chave_inst(string $i): string { return substr(hash_hmac('sha256', "lykeion-inst|$i", segredo()), 0, 20); }
function chave_aprovar(string $id): string { return substr(hash_hmac('sha256', "lykeion-aprovar|$id", segredo()), 0, 20); }
function chave_links(): string { return substr(hash_hmac('sha256', 'lykeion-links', segredo()), 0, 24); }
function k_ok(string $esperada): bool { return segredo() !== '' && hash_equals($esperada, (string)($_GET['k'] ?? '')); }
function acad(): array { static $d = null; return $d ?? ($d = json_decode((string)@file_get_contents(__DIR__ . '/../academia.json'), true) ?: ['inst' => [], 'subtipos' => [], 'concelhos' => []]); }
function dominios(): array { static $d = null; return $d ?? ($d = json_decode((string)@file_get_contents(__DIR__ . '/../dominios.json'), true) ?: []); }
function inst_do_url(string $u): string {  // a instituição dona do site da ligação (o sufixo mais comprido), ou ''
  $h = strtolower((string)parse_url($u, PHP_URL_HOST)); $h = preg_replace('/^www\./', '', $h); $D = dominios();
  while ($h !== '' && substr_count($h, '.') >= 1) { if (isset($D[$h])) return (string)$D[$h]; $p = strpos($h, '.'); if ($p === false) break; $h = substr($h, $p + 1); }
  return '';
}
function nome_inst(string $i): string { $r = acad()['inst'][$i] ?? null; return $r ? (string)$r[0] : ''; }
function limpa(string $s, int $max): string { return mb_substr(trim(preg_replace('/[ \t]+/', ' ', str_replace(["\r\n", "\r"], "\n", strip_tags($s)))), 0, $max); }
function linha_csv(array $v, array $cols = COLS): string { return implode(';', array_map(fn($c) => preg_match('/[;"\r\n]/', (string)($v[$c] ?? '')) ? '"' . str_replace('"', '""', (string)$v[$c]) . '"' : (string)($v[$c] ?? ''), $cols)); }
function publicar(array $v): void {  // junta a linha ao CSV no GitHub (volta a ler se alguém gravou entretanto)
  $prazo = ($v['tipo_proposta'] ?? '') === 'prazo';
  [$csv, $cols] = $prazo ? [CSV_PRAZOS, COLS_PRAZOS] : [CSV_PROP, COLS];
  gh_gravar([], 'Lykeion: ' . ($prazo ? 'prazo proposto (' . mb_substr($v['nome'], 0, 60) : 'evento proposto (' . mb_substr($v['titulo'], 0, 60)) . ')', function () use ($v, $csv, $cols) {
    try { $atual = gh_ler($csv); } catch (Throwable $e) { $atual = ''; }
    $cab = implode(';', $cols);
    if (trim($atual) === '') $atual = $cab . "\n";
    // colunas novas no fim (8/11/2026): o cabeçalho antigo passa ao novo; as linhas antigas ficam com as colunas novas vazias
    [$l1, $resto] = array_pad(explode("\n", $atual, 2), 2, '');
    if (rtrim($l1, "\r") !== $cab && str_starts_with($cab, rtrim($l1, "\r"))) $atual = $cab . "\n" . $resto;
    if (strpos($atual, ';' . $v['id'] . ';') !== false) return [$csv => $atual];
    return [$csv => rtrim($atual, "\n") . "\n" . linha_csv($v, $cols) . "\n"];
  });
}
function chave_org(string $id): string { return substr(hash_hmac('sha256', "lykeion-org|$id", segredo()), 0, 20); }  // a mesma do inscrever.php
function link_org(string $id): string { global $URL; return $URL . 'conta/inscrever.php?org=' . rawurlencode($id) . '&k=' . chave_org($id); }
function data_ok(string $d): bool { return (bool)preg_match('/^\d{4}-\d{2}-\d{2}$/', $d) && checkdate((int)substr($d, 5, 2), (int)substr($d, 8, 2), (int)substr($d, 0, 4)); }
$h = fn($s) => htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8');

try {
  header('Content-Type: text/html; charset=utf-8'); header('Cache-Control: no-store'); header('X-Robots-Tag: noindex');
  // 7/11/2026 (Paulo: «uniformizar tudo no site»): o mesmo cabeçalho, tipos de letra e cores das outras páginas do Lykeion
  $topo = '<!doctype html><html lang="pt-PT"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Propor um evento · Lykeion</title>'
    . '<link rel="icon" href="' . $URL . 'assets/marca/lykeion/icone.svg" type="image/svg+xml"><meta name="theme-color" content="#1F4E3D">'
    . '<link rel="stylesheet" href="' . $URL . 'assets/fontes.css"><link rel="stylesheet" href="' . $URL . 'assets/lagenda.css"><link rel="stylesheet" href="' . $URL . 'assets/lykeion.css">'
    . '<style>.lyk-form label{display:block;margin:14px 0 4px;font-weight:600}.lyk-form table td,.lyk-form table th{border-bottom:1px solid var(--linha);padding:6px 4px;text-align:left}.lyk main{border-image:linear-gradient(var(--faixa),var(--papel) 18rem) fill 0//0 100vmax}.lyk-form div[style*="grid-template-columns:1fr 1fr 1fr"]{grid-template-columns:repeat(auto-fit,minmax(140px,1fr))!important}</style></head>'
    . '<body class="lyk"><header class="barra lyk-barra"><div class="mol bin"><a class="marca lyk-marca" href="' . $URL . '">' . (@file_get_contents(__DIR__ . '/../assets/marca/lykeion/cabecalho.svg') ?: 'Lykeion') . '</a>'
    . '<nav class="menu"><a class="lyk-so-pc" href="' . $URL . '">Início</a><a class="lyk-so-pc" href="' . $URL . 'listas/">Áreas</a><a class="lyk-so-pc" href="' . $URL . 'instituicoes/">Instituições</a><a class="lyk-so-pc" href="' . $URL . 'chamadas/">Chamadas</a></nav></div></header>'
    . '<main><div class="mol lyk-form" style="max-width:760px;padding-block:1.4rem 2.4rem">';
  $fim = '</div></main></body></html>';

  // ---- links pessoais das instituições (para a gestão) ----
  if (isset($_GET['links'])) {
    if (!k_ok(chave_links())) {
      if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        enviar_email($CFG['email_avisos'], '[Lykeion] Links das instituições', "Para ver e copiar o link pessoal de cada instituição:\n{$URL}conta/propor.php?links&k=" . chave_links() . "\n", '', 'Lykeion');
        exit($topo . '<p>Enviado para o email da gestão.</p>' . $fim);
      }
      exit($topo . '<h1>Links das instituições</h1><form method="post"><p>O link para esta lista vai para o email da gestão.</p><button style="padding:10px 16px">Enviar</button></form>' . $fim);
    }
    $I = acad()['inst']; uasort($I, fn($a, $b) => strcoll($a[0], $b[0]));
    echo $topo, '<h1>Links das instituições</h1><p>Com o seu link, a instituição junta eventos ao Lykeion e eles aparecem logo, sem revisão. Envie-o só a quem fala pela instituição (gabinete de comunicação).</p><table style="border-collapse:collapse;width:100%;font-size:14px">';
    foreach ($I as $id => $r) echo '<tr style="border-top:1px solid #DCD6C8"><td style="padding:6px 8px 6px 0"><b>', $h($r[0]), '</b></td><td style="padding:6px 0;width:55%"><input readonly style="width:100%;font:13px monospace" value="', $h($URL . 'conta/propor.php?i=' . rawurlencode($id) . '&k=' . chave_inst($id)), '" onclick="this.select()"></td></tr>';
    exit('</table>' . $fim);
  }

  // ---- aprovar uma proposta que ficou à espera (um clique no email) ----
  if (isset($_GET['aprovar'])) {
    $id = mb_substr((string)$_GET['aprovar'], 0, 16);
    if (!k_ok(chave_aprovar($id))) { http_response_code(403); exit($topo . '<p>Este link não é válido.</p>' . $fim); }
    $q = pp_bd()->prepare('SELECT dados, estado FROM lg_propostas WHERE id = ?'); $q->execute([$id]); $r = $q->fetch(PDO::FETCH_ASSOC);
    if (!$r) exit($topo . '<p>Não encontrei esta proposta.</p>' . $fim);
    if ($r['estado'] !== 'publicada') { publicar(json_decode($r['dados'], true)); pp_bd()->prepare("UPDATE lg_propostas SET estado = 'publicada' WHERE id = ?")->execute([$id]); }
    $v = json_decode($r['dados'], true);
    exit($topo . '<p>Publicado: <b>' . $h($v['titulo'] ?? $v['nome'] ?? '') . '</b>. Aparece no Lykeion daqui a uns minutos.</p>' . $fim);
  }

  // ---- propor um prazo de bolsa, prémio ou concurso (8/11/2026) ----
  if (isset($_GET['prazo'])) {
    $A = acad(); $inst = (string)($_GET['i'] ?? ''); if (!isset($A['inst'][$inst])) $inst = '';
    $pessoal = $inst !== '' && isset($_GET['k']) && k_ok(chave_inst($inst));
    $erros = []; $v = []; $msg = '';
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
      $P = $_POST;
      if (($P['site'] ?? '') !== '' || time() - (int)($P['t'] ?? 0) < 4) { http_response_code(400); exit($topo . '<p>Não conseguimos receber. Tente outra vez.</p>' . $fim); }
      $v = ['tipo_proposta' => 'prazo', 'tipo' => (string)($P['tipo'] ?? ''), 'nome' => limpa((string)($P['nome'] ?? ''), 200), 'entidade' => limpa((string)($P['entidade'] ?? ''), 120),
            'prazo' => (string)($P['prazo'] ?? ''), 'ligacao' => trim((string)($P['ligacao'] ?? '')), 'publico' => limpa((string)($P['publico'] ?? ''), 120), 'area' => ''];
      $email = trim((string)($P['email'] ?? ''));
      if (!in_array($v['tipo'], array_column(TIPOS_PRAZO, 0), true)) $erros[] = 'Escolha o tipo.';
      if (mb_strlen($v['nome']) < 4) $erros[] = 'Falta o nome.';
      if (mb_strlen($v['entidade']) < 2) $erros[] = 'Falta quem atribui ou financia.';
      if (!data_ok($v['prazo']) || $v['prazo'] < date('Y-m-d') || $v['prazo'] > date('Y-m-d', strtotime('+2 years'))) $erros[] = 'O prazo tem de ser de hoje em diante.';
      if (!preg_match('#^https?://[^\s/]+\.[^\s]+$#i', $v['ligacao']) || strlen($v['ligacao']) > 400) $erros[] = 'Falta a ligação para o regulamento ou a página oficial.';
      if (!$pessoal && !filter_var($email, FILTER_VALIDATE_EMAIL)) $erros[] = 'Falta o seu email (só para o caso de termos uma dúvida; não aparece no site).';
      $dono = inst_do_url($v['ligacao']);
      $ip = hash('sha256', ($_SERVER['REMOTE_ADDR'] ?? '') . segredo());
      $q = pp_bd()->prepare('SELECT COUNT(*) FROM lg_propostas WHERE ip = ? AND criado_em >= ?'); $q->execute([$ip, date('Y-m-d 00:00:00')]);
      if (!$pessoal && (int)$q->fetchColumn() >= MAX_DIA_IP) $erros[] = 'Recebemos muitas propostas deste endereço hoje. Tente amanhã.';
      if (!$erros) {
        $v['id'] = substr(sha1('prazo|' . $v['nome'] . '|' . $v['prazo'] . '|' . $v['ligacao']), 0, 12); $v['enviado_em'] = date('Y-m-d');
        $v['quem'] = $pessoal ? 'instituicao' : ($dono ? 'site-da-instituicao' : 'visitante');
        $ja = pp_bd()->prepare('SELECT estado FROM lg_propostas WHERE id = ?'); $ja->execute([$v['id']]); $antes = $ja->fetchColumn();
        $logo = $pessoal || $dono !== '';
        if ($antes === false) pp_bd()->prepare('INSERT INTO lg_propostas (id, dados, email, ip, estado, criado_em) VALUES (?,?,?,?,?,?)')
          ->execute([$v['id'], json_encode($v, JSON_UNESCAPED_UNICODE), $email, $ip, $logo ? 'publicada' : 'espera', date('Y-m-d H:i:s')]);
        $resumo = "{$v['nome']}\n{$v['entidade']}\nPrazo: {$v['prazo']}\n{$v['ligacao']}\n" . ($v['publico'] ? "Para: {$v['publico']}\n" : '') . ($email ? "\nProposto por: $email\n" : '');
        if ($antes === 'publicada') $msg = 'Este prazo já estava no Lykeion.';
        elseif ($logo) { publicar($v); enviar_email($CFG['email_avisos'], '[Lykeion] Prazo publicado: ' . mb_substr($v['nome'], 0, 80), "Publicado sozinho:\n\n$resumo", '', 'Lykeion'); $msg = 'Recebido. Aparece em «Prazos» daqui a uns minutos. Obrigado!'; }
        else {
          enviar_email($CFG['email_avisos'], '[Lykeion] Prazo proposto: ' . mb_substr($v['nome'], 0, 80), "Um visitante propôs este prazo.\n\n$resumo\nPublicar com um clique:\n{$URL}conta/propor.php?aprovar={$v['id']}&k=" . chave_aprovar($v['id']) . "\n", $email, 'Lykeion');
          $msg = 'Recebido. Vemos a proposta e publicamos em breve. Obrigado!';
        }
        $v = [];
      }
    }
    $campo = 'font:inherit;width:100%;box-sizing:border-box;padding:.6rem .7rem;border:1px solid var(--linha);border-radius:8px;background:var(--papel);color:var(--tinta)';
    $rot = fn($t, $x = '') => '<label>' . $t . ($x ? ' <span style="font-weight:400;color:var(--suave)">' . $x . '</span>' : '') . '</label>';
    $val = fn($k) => $h($v[$k] ?? '');
    echo $topo, '<h1>Propor um prazo</h1><p style="color:var(--suave);margin:4px 0 0">Bolsas, prémios, concursos e financiamento para a ciência em Portugal, com candidaturas abertas. Só os factos e a ligação para o regulamento oficial.</p>',
      $msg ? '<p style="background:var(--cobalto);color:#fff;padding:8px 12px;border-radius:4px">' . $h($msg) . '</p>' : '',
      $erros ? '<div style="background:#FBE9E1;border-left:3px solid var(--legenda);padding:8px 12px;margin-top:12px">' . implode('<br>', array_map($h, $erros)) . '</div>' : '',
      '<form method="post"><input type="hidden" name="t" value="', time(), '"><div style="position:absolute;left:-9999px" aria-hidden="true"><input name="site" tabindex="-1" autocomplete="off"></div>',
      $rot('Tipo'), '<select name="tipo" required style="', $campo, '"><option value="">Escolha…</option>', implode('', array_map(fn($o) => '<option value="' . $o[0] . '"' . (($v['tipo'] ?? '') === $o[0] ? ' selected' : '') . '>' . $o[1] . '</option>', TIPOS_PRAZO)), '</select>',
      $rot('Nome'), '<input name="nome" required maxlength="200" value="', $val('nome'), '" style="', $campo, '" placeholder="Prémio de Investigação em …">',
      $rot('Quem atribui ou financia'), '<input name="entidade" required maxlength="120" value="', $val('entidade'), '" style="', $campo, '">',
      $rot('Prazo das candidaturas'), '<input type="date" name="prazo" required value="', $val('prazo'), '" style="', $campo, '">',
      $rot('Para quem', '(opcional: doutorandos, investigadores até 35 anos…)'), '<input name="publico" maxlength="120" value="', $val('publico'), '" style="', $campo, '">',
      $rot('Ligação para o regulamento ou a página oficial'), '<input name="ligacao" type="url" required maxlength="400" value="', $val('ligacao'), '" style="', $campo, '" placeholder="https://…">',
      $pessoal ? '' : $rot('O seu email', '(só para uma dúvida; não aparece no site)') . '<input name="email" type="email" required maxlength="190" style="' . $campo . '">',
      '<p style="margin-top:18px"><button class="bt" style="background:var(--cobalto);color:#fff;border-color:var(--cobalto)">Enviar</button></p></form>',
      '<p class="sub"><a href="', $URL, 'prazos/">Ver todos os prazos</a> · <a href="', $URL, 'conta/propor.php">Propor um evento</a></p>', $fim;
    exit;
  }
  // ---- formulário ----
  $A = acad(); $inst = (string)($_GET['i'] ?? ''); if (!isset($A['inst'][$inst])) $inst = '';
  $pessoal = $inst !== '' && isset($_GET['k']) && k_ok(chave_inst($inst));
  $subs = array_values(array_filter((array)$A['subtipos'], fn($s) => true));
  $erros = []; $v = []; $msg = '';
  if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $P = $_POST;
    if (($P['site'] ?? '') !== '' || time() - (int)($P['t'] ?? 0) < 4) { http_response_code(400); exit($topo . '<p>Não conseguimos receber. Tente outra vez.</p>' . $fim); }
    $hoje = date('Y-m-d');
    $v = ['titulo' => limpa((string)($P['titulo'] ?? ''), 200), 'subtipo' => (string)($P['subtipo'] ?? ''), 'data_inicio' => (string)($P['data_inicio'] ?? ''),
          'data_fim' => (string)($P['data_fim'] ?? ''), 'hora' => (string)($P['hora'] ?? ''), 'local' => limpa((string)($P['local'] ?? ''), 120),
          'concelho' => limpa((string)($P['concelho'] ?? ''), 60), 'url' => trim((string)($P['url'] ?? '')), 'modo' => (string)($P['modo'] ?? 'presencial'),
          'prazo' => (string)($P['prazo'] ?? ''), 'descricao' => limpa((string)($P['descricao'] ?? ''), 600),
          'instituicao' => $pessoal ? $inst : (string)($P['instituicao'] ?? ''),
          // 8/11/2026: inscrições no Lykeion, transmissão, acessibilidade e língua
          'inscricoes' => empty($P['inscricoes']) ? '' : '1', 'lotacao' => (string)max(0, min(100000, (int)($P['lotacao'] ?? 0))), 'direto' => trim((string)($P['direto'] ?? '')), 'gravacao' => '',
          'acess' => implode(',', array_values(array_intersect(array_column(ACESS, 0), (array)($P['acess'] ?? [])))), 'lingua' => ($P['lingua'] ?? '') === 'en' ? 'en' : ''];
    if ($v['lotacao'] === '0') $v['lotacao'] = '';
    $email = trim((string)($P['email'] ?? ''));
    if (mb_strlen($v['titulo']) < 4) $erros[] = 'Falta o título.';
    if (!in_array($v['subtipo'], array_column($subs, 0), true)) $erros[] = 'Escolha o tipo de evento.';
    if (!data_ok($v['data_inicio']) || $v['data_inicio'] < $hoje || $v['data_inicio'] > date('Y-m-d', strtotime('+2 years'))) $erros[] = 'A data tem de ser de hoje em diante.';
    if ($v['data_fim'] === '') $v['data_fim'] = $v['data_inicio'];
    if (!data_ok($v['data_fim']) || $v['data_fim'] < $v['data_inicio'] || (strtotime($v['data_fim']) - strtotime($v['data_inicio'])) > 60 * 86400) $erros[] = 'A data do fim não está certa (no máximo 60 dias depois do início).';
    if ($v['hora'] !== '' && !preg_match('/^([01]?\d|2[0-3]):[0-5]\d$/', $v['hora'])) $erros[] = 'A hora tem de ser como 18:30.';
    if (!in_array($v['concelho'], (array)$A['concelhos'], true)) $erros[] = 'Escolha o concelho da lista.';
    // com inscrições no Lykeion, a página do evento no Lykeion pode ser a única (quem usava o Eventbrite só para contar pessoas)
    if (($v['url'] !== '' || !$v['inscricoes']) && (!preg_match('#^https?://[^\s/]+\.[^\s]+$#i', $v['url']) || strlen($v['url']) > 400)) $erros[] = $v['inscricoes'] ? 'A ligação para a página oficial não está certa (ou deixe em branco).' : 'Falta a ligação para a página oficial do evento (ou peça inscrições no Lykeion).';
    if ($v['direto'] !== '' && (!preg_match('#^https?://[^\s/]+\.[^\s]+$#i', $v['direto']) || strlen($v['direto']) > 400)) $erros[] = 'A ligação da transmissão não está certa.';
    if (!in_array($v['modo'], ['presencial', 'online', 'hibrido'], true)) $v['modo'] = 'presencial';
    if ($v['prazo'] !== '' && (!data_ok($v['prazo']) || $v['prazo'] < $hoje || $v['prazo'] > $v['data_inicio'])) $erros[] = 'O prazo de submissão tem de ser entre hoje e o início do evento.';
    if (($v['inscricoes'] || !$pessoal) && !filter_var($email, FILTER_VALIDATE_EMAIL)) $erros[] = $v['inscricoes'] ? 'Falta o seu email: é para lá que mandamos o link para ver a lista de inscritos.' : 'Falta o seu email (só para o caso de termos uma dúvida; não aparece no site).';
    $dono = $v['url'] !== '' ? inst_do_url($v['url']) : '';
    if (!$pessoal) { if ($dono) $v['instituicao'] = $dono; elseif (!isset($A['inst'][$v['instituicao']])) $v['instituicao'] = ''; }
    $ip = hash('sha256', ($_SERVER['REMOTE_ADDR'] ?? '') . segredo());
    $q = pp_bd()->prepare('SELECT COUNT(*) FROM lg_propostas WHERE ip = ? AND criado_em >= ?'); $q->execute([$ip, date('Y-m-d 00:00:00')]);
    if (!$pessoal && (int)$q->fetchColumn() >= MAX_DIA_IP) $erros[] = 'Recebemos muitas propostas deste endereço hoje. Tente amanhã ou escreva para info@lykeion.pt.';
    if (!$erros) {
      $v['id'] = substr(sha1($v['titulo'] . '|' . $v['data_inicio'] . '|' . ($v['url'] ?: $v['instituicao'] . $v['local'])), 0, 12);
      $v['enviado_em'] = date('Y-m-d'); $v['quem'] = $pessoal ? 'instituicao' : ($dono ? 'site-da-instituicao' : 'visitante');
      $ja = pp_bd()->prepare('SELECT estado FROM lg_propostas WHERE id = ?'); $ja->execute([$v['id']]); $antes = $ja->fetchColumn();
      $logo = $pessoal || $dono !== '';
      if ($antes === false) pp_bd()->prepare('INSERT INTO lg_propostas (id, dados, email, ip, estado, criado_em) VALUES (?,?,?,?,?,?)')
        ->execute([$v['id'], json_encode($v, JSON_UNESCAPED_UNICODE), $email, $ip, $logo ? 'publicada' : 'espera', date('Y-m-d H:i:s')]);
      $resumo = "{$v['titulo']}\n{$v['data_inicio']}" . ($v['data_fim'] !== $v['data_inicio'] ? " a {$v['data_fim']}" : '') . ($v['hora'] ? " às {$v['hora']}" : '')
        . "\n{$v['local']}, {$v['concelho']}\n" . (nome_inst($v['instituicao']) ?: '(sem instituição)') . "\n{$v['url']}\n" . ($v['prazo'] ? "Prazo de submissão: {$v['prazo']}\n" : '')
        . ($v['descricao'] ? "\n{$v['descricao']}\n" : '') . ($v['inscricoes'] ? "Inscrições no Lykeion" . ($v['lotacao'] ? " ({$v['lotacao']} lugares)" : '') . "\n" : '') . ($email ? "\nProposto por: $email\n" : '');
      // o organizador recebe o link da sua página (inscritos, mensagens, direto e gravação), mesmo antes de o evento aparecer
      if ($antes === false && filter_var($email, FILTER_VALIDATE_EMAIL))
        enviar_email($email, 'O seu evento no Lykeion: ' . mb_substr($v['titulo'], 0, 80), "Olá,\n\nRecebemos o seu evento:\n\n{$v['titulo']}\n{$v['data_inicio']}" . ($v['hora'] ? " às {$v['hora']}" : '') . "\n\n"
          . ($v['inscricoes'] ? "Tem inscrições gratuitas no Lykeion. Nesta página vê quantas pessoas se inscreveram e a lista, descarrega-a em Excel, fecha as inscrições, escreve aos inscritos e, depois do evento, junta a ligação da gravação:\n\n"
                              : "Nesta página pode abrir inscrições gratuitas no Lykeion e juntar a ligação da transmissão em direto e, depois, a da gravação:\n\n")
          . link_org($v['id']) . "\n\nGuarde este email: o link é só seu, sem palavra-passe.\n" . ($logo ? '' : "\nAntes de aparecer no Lykeion, vemos o evento (normalmente no próprio dia).\n") . "\nLykeion · O encontro da ciência\n", '', 'Lykeion');
      if ($antes === 'publicada') $msg = 'Este evento já estava no Lykeion.';
      elseif ($logo) {
        publicar($v);
        enviar_email($CFG['email_avisos'], '[Lykeion] Evento publicado: ' . mb_substr($v['titulo'], 0, 80), "Publicado sozinho (" . ($pessoal ? 'link pessoal da instituição' : 'ligação para o site da instituição') . "):\n\n$resumo", '', 'Lykeion');
        $msg = 'Recebido. Aparece no Lykeion daqui a uns minutos' . ($v['url'] ? ', com ligação para a página oficial' : '') . '.' . (filter_var($email, FILTER_VALIDATE_EMAIL) ? ' Mandámos para o seu email o link para gerir o evento' . ($v['inscricoes'] ? ' e ver os inscritos' : '') . '.' : '') . ' Obrigado!';
      } else {
        enviar_email($CFG['email_avisos'], '[Lykeion] Evento proposto: ' . mb_substr($v['titulo'], 0, 80),
          "Um visitante propôs este evento. A ligação não é para o site de uma instituição que conhecemos, por isso espera por si.\n\n$resumo\nPublicar com um clique:\n{$URL}conta/propor.php?aprovar={$v['id']}&k=" . chave_aprovar($v['id']) . "\n\nSe não for para publicar, não precisa de fazer nada.\n", $email, 'Lykeion');
        $msg = 'Recebido. Vemos a proposta e publicamos em breve. Mandámos para o seu email o link para gerir o evento. Obrigado!';
      }
      $v = [];
    }
  }
  $campo = 'font:inherit;width:100%;box-sizing:border-box;padding:.6rem .7rem;border:1px solid var(--linha);border-radius:8px;background:var(--papel);color:var(--tinta)';
  $rot = fn($t, $x = '') => '<label>' . $t . ($x ? ' <span style="font-weight:400;color:var(--suave)">' . $x . '</span>' : '') . '</label>';
  $val = fn($k) => $h($v[$k] ?? '');
  $opt = fn($lista, $sel) => implode('', array_map(fn($o) => '<option value="' . $h($o[0]) . '"' . ($o[0] === $sel ? ' selected' : '') . '>' . $h($o[1]) . '</option>', $lista));
  $insts = []; foreach ((array)$A['inst'] as $id => $r) $insts[] = [$id, $r[0] . ($r[1] && stripos($r[0], $r[1]) === false ? " ({$r[1]})" : '')];
  usort($insts, fn($a, $b) => strcoll($a[1], $b[1]));
  echo $topo, '<h1>Propor um evento</h1>',
    $pessoal ? '<p style="margin:4px 0 0">Link pessoal de <b>' . $h(nome_inst($inst)) . '</b>: o que juntar aqui aparece logo no Lykeion, daqui a uns minutos. Guarde este link.</p>'
             : '<p style="color:var(--suave);margin:4px 0 0">Congressos, conferências, seminários, aulas abertas, provas públicas e ciência para todos, de instituições portuguesas. Só os factos e a ligação para a página oficial. Se a ligação for para o site da instituição, aparece logo; se não, vemos primeiro.</p>',
    $msg ? '<p style="background:var(--cobalto);color:#fff;padding:8px 12px;border-radius:4px">' . $h($msg) . '</p>' : '',
    $erros ? '<div style="background:#FBE9E1;border-left:3px solid var(--legenda);padding:8px 12px;margin-top:12px">' . implode('<br>', array_map($h, $erros)) . '</div>' : '',
    '<form method="post"><input type="hidden" name="t" value="', time(), '"><div style="position:absolute;left:-9999px" aria-hidden="true"><input name="site" tabindex="-1" autocomplete="off"></div>',
    $rot('Título'), '<input name="titulo" required maxlength="200" value="', $val('titulo'), '" style="', $campo, '">',
    $rot('Tipo'), '<select name="subtipo" required style="', $campo, '"><option value="">Escolha…</option>', $opt(array_map(fn($s) => [$s[0], $s[1]], $subs), (string)($v['subtipo'] ?? '')), '</select>',
    '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px"><div>', $rot('Dia'), '<input type="date" name="data_inicio" required value="', $val('data_inicio'), '" style="', $campo, '"></div>',
    '<div>', $rot('Até', '(se for mais de um dia)'), '<input type="date" name="data_fim" value="', $val('data_fim'), '" style="', $campo, '"></div>',
    '<div>', $rot('Hora'), '<input type="time" name="hora" value="', $val('hora'), '" style="', $campo, '"></div></div>',
    $rot('Onde', '(sala, edifício)'), '<input name="local" maxlength="120" value="', $val('local'), '" style="', $campo, '" placeholder="Aula Magna, Reitoria">',
    $rot('Concelho'), '<input name="concelho" required list="concelhos" value="', $val('concelho'), '" style="', $campo, '" placeholder="Lisboa"><datalist id="concelhos">',
    implode('', array_map(fn($c) => '<option value="' . $h($c) . '">', (array)$A['concelhos'])), '</datalist>',
    $pessoal ? '' : $rot('Instituição', '(se não estiver na lista, deixe em branco)') . '<select name="instituicao" style="' . $campo . '"><option value="">—</option>' . $opt($insts, (string)($v['instituicao'] ?? $inst)) . '</select>',
    $rot('Ligação para a página oficial do evento', '(se pedir inscrições no Lykeion e não houver outra página, pode deixar em branco)'), '<input name="url" type="url" maxlength="400" value="', $val('url'), '" style="', $campo, '" placeholder="https://…">',
    '<fieldset style="border:1px solid var(--linha);border-radius:10px;padding:4px 14px 14px;margin-top:18px"><legend style="font-weight:600;padding:0 6px">Inscrições gratuitas no Lykeion</legend>',
    '<label style="font-weight:400"><input type="checkbox" name="inscricoes" value="1"', !empty($v['inscricoes']) ? ' checked' : '', '> Quero que as pessoas se inscrevam aqui (em vez de abrir um evento no Eventbrite só para contar quem vem)</label>',
    '<p style="color:var(--suave);font-size:14px;margin:6px 0 0">Recebe por email um link para ver a lista de inscritos, descarregá-la em Excel e escrever-lhes. Mandamos a confirmação e um lembrete na véspera. É gratuito.</p>',
    $rot('Lotação', '(opcional: com limite, quem vier a mais fica em lista de espera)'), '<input type="number" name="lotacao" min="0" max="100000" value="', $val('lotacao'), '" style="', $campo, ';max-width:10rem"></fieldset>',
    $rot('Como se assiste'), '<select name="modo" style="', $campo, '">', $opt([['presencial', 'Presencial'], ['online', 'Online'], ['hibrido', 'Presencial e online']], (string)($v['modo'] ?? 'presencial')), '</select>',
    $rot('Ligação da transmissão em direto', '(se houver; a da gravação junta-se depois, no link que lhe mandamos)'), '<input name="direto" type="url" maxlength="400" value="', $val('direto'), '" style="', $campo, '" placeholder="https://youtube.com/…">',
    $rot('Língua'), '<select name="lingua" style="', $campo, '">', $opt([['', 'Português'], ['en', 'Inglês']], (string)($v['lingua'] ?? '')), '</select>',
    $rot('Acessibilidade', '(o que o evento garante)'), implode('', array_map(fn($o) => '<label style="font-weight:400;margin:4px 0"><input type="checkbox" name="acess[]" value="' . $o[0] . '"' . (in_array($o[0], explode(',', (string)($v['acess'] ?? '')), true) ? ' checked' : '') . '> ' . $o[1] . '</label>', ACESS)),
    $rot('Prazo para submeter comunicações', '(congressos com chamada aberta; aparece em «Chamadas abertas»)'), '<input type="date" name="prazo" value="', $val('prazo'), '" style="', $campo, '">',
    $rot('Em poucas palavras', '(opcional, até 600 caracteres)'), '<textarea name="descricao" maxlength="600" rows="4" style="', $campo, '">', $val('descricao'), '</textarea>',
    $rot('O seu email', $pessoal ? '(para receber o link de gestão do evento; obrigatório com inscrições; não aparece no site)' : '(para o link de gestão do evento e uma dúvida; não aparece no site)') . '<input name="email" type="email"' . ($pessoal ? '' : ' required') . ' maxlength="190" style="' . $campo . '">',
    '<p style="margin-top:18px"><button class="bt" style="background:var(--cobalto);color:#fff;border-color:var(--cobalto)">Enviar</button></p></form>',
    '<p style="color:var(--suave);font-size:13px">É de uma instituição e quer juntar eventos sempre que houver? Peça o link pessoal da sua instituição para info@lykeion.pt: o que juntar aparece logo, sem revisão. ',
    'Também pode <a href="', $URL, 'incorporar/">pôr a agenda da instituição no seu site</a>. Tem uma bolsa, um prémio ou um concurso com candidaturas abertas? <a href="', $URL, 'conta/propor.php?prazo">Proponha o prazo</a>.</p>', $fim;
} catch (Throwable $e) {
  error_log('lykeion propor: ' . $e->getMessage());
  http_response_code(500); echo 'Algo correu mal do nosso lado. Tente outra vez daqui a pouco, ou escreva para info@lykeion.pt.';
}
