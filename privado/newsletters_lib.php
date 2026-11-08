<?php
// Newsletters das câmaras e juntas que chegam a info@lykeion.pt.
// 1) Emails «confirme a sua subscrição»: o servidor abre sozinho o link de confirmação (como quem clica nele) e, se a
//    página pedir mais um clique («Confirmar», «Subscrever», consentimento), dá-o. Só conta como feito quando a página
//    diz que a subscrição ficou confirmada; senão o email fica em «Para tratar».
//    Só se o assunto ou o texto falarem de confirmar a subscrição, e só links de confirmação (nunca de cancelar).
// 2) As newsletters em si (com cabeçalho List-Unsubscribe/List-Id, isto é, envios em massa) ficam guardadas
//    com o estado «newsletter»: não entram em «Para tratar», mas ficam na base para se lerem os eventos.
// Registo das confirmações na tabela nl_confirmacoes (url, de_email, assunto, http, em).

const NL_PEDIDO = '/(subscri|inscri|newsletter|boletim|mailing|double.?opt|opt.?in|lista de (envio|correio|email))/iu';
const NL_LINK_SIM = '/(confirm|subscri|ativ|activ|valid|verifi|opt.?in|clique aqui|click here|sim, quero|yes)/iu';
const NL_LINK_NAO = '/(unsubscri|cancel|anular|remov|desinscr|deixar de|opt.?out|preferenc|privacidade|privacy|termos|terms|facebook|instagram|twitter|youtube|linkedin|whatsapp|mailto:|\.pdf|\.jpe?g|\.png)/iu';

function nl_tabela(PDO $pdo): void {
  $my = $pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql';
  $id = $my ? 'id INT AUTO_INCREMENT PRIMARY KEY' : 'id INTEGER PRIMARY KEY AUTOINCREMENT';
  $pdo->exec("CREATE TABLE IF NOT EXISTS nl_confirmacoes ($id, de_email VARCHAR(160), assunto VARCHAR(300), url TEXT, http INT, em CHAR(16))"
    . ($my ? ' DEFAULT CHARSET=utf8mb4' : ''));
  foreach (['resultado VARCHAR(20)', 'nota TEXT'] as $col) try { $pdo->exec("ALTER TABLE nl_confirmacoes ADD COLUMN $col"); } catch (Throwable $e) {} // já existe
}

// Links de um email em HTML (ou em texto), com o texto de cada um.
function nl_links(string $html, string $texto): array {
  $r = [];
  if ($html !== '' && preg_match_all('#<a\b[^>]*href\s*=\s*["\']([^"\']+)["\'][^>]*>(.*?)</a>#is', $html, $mm, PREG_SET_ORDER))
    foreach ($mm as $m) $r[] = [html_entity_decode(trim($m[1]), ENT_QUOTES | ENT_HTML5, 'UTF-8'), trim(html_entity_decode(strip_tags($m[2]), ENT_QUOTES | ENT_HTML5, 'UTF-8'))];
  if (preg_match_all('#https?://[^\s<>"\')\]]+#i', $texto, $mm)) foreach ($mm[0] as $u) $r[] = [$u, ''];
  return array_values(array_filter($r, fn($l) => !preg_match('#^(mailto|tel|javascript):|^\##i', $l[0])));
}

// O link de confirmação, se este email for um pedido de confirmação de subscrição.
function nl_link_confirmacao(array $m): string {
  $sobre = $m['assunto'] . ' ' . mb_substr($m['texto'], 0, 1500);
  if (!preg_match(NL_PEDIDO, $sobre) || !preg_match('/(confirm|valid|verifi|ativ|activ|opt.?in)/iu', $sobre)) return '';
  $melhor = ''; $pontos = 0;
  foreach (nl_links($m['html'] ?? '', $m['texto']) as [$url, $txt]) {
    if (!preg_match('#^https?://#i', $url)) continue;
    if (preg_match(NL_LINK_NAO, $url . ' ' . $txt)) continue;
    $p = (preg_match(NL_LINK_SIM, $txt) ? 2 : 0) + (preg_match('/(confirm|subscri|activ|ativ|valid|verif|optin|opt-in)/i', $url) ? 2 : 0);
    if ($p > $pontos) { $pontos = $p; $melhor = $url; }
  }
  return $pontos >= 2 ? $melhor : '';
}

const NL_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 Lykeion/1.0 (info@lykeion.pt)';
const NL_FEITO = '/(subscri[çc][ãa]o (foi |est[áa] |encontra-se )?(confirmad|ativad|activad|conclu|efetuad|realizad|validad)|confirmad[oa] com sucesso|(foi|est[áa]) (confirmad|ativad|subscrit|inscrit)|já (se encontra|está) (subscrit|inscrit|registad)|obrigad[oa] (por|pela) (subscrever|confirmar|se inscrever|inscri)|subscription (is )?(confirmed|activated|complete)|you(\'| a)re (now )?(subscribed|on the list)|thank you for (subscribing|confirming)|e-?mail (confirmado|verificado)|registo (confirmado|concluído))/iu';

// Pedido HTTP com cookies (GET, ou POST com $dados). Verificação TLS sempre ligada. Devolve [código, endereço final, página].
function nl_pedido(string $url, ?array $dados, string $cookies, string $referer = ''): array {
  if (!function_exists('curl_init')) {
    $o = ['http' => ['timeout' => 20, 'user_agent' => NL_UA, 'ignore_errors' => true]];
    if ($dados !== null) $o['http'] += ['method' => 'POST', 'header' => "Content-Type: application/x-www-form-urlencoded\r\n", 'content' => http_build_query($dados)];
    $r = @file_get_contents($url, false, stream_context_create($o));
    $h = preg_match('#HTTP/\S+\s+(\d+)#', implode("\n", $http_response_header ?? []), $x) ? (int)$x[1] : 0;
    return [$r === false ? 0 : $h, $url, (string)$r];
  }
  $c = curl_init($url);
  $op = [CURLOPT_RETURNTRANSFER => true, CURLOPT_FOLLOWLOCATION => true, CURLOPT_MAXREDIRS => 8, CURLOPT_TIMEOUT => 25,
    CURLOPT_USERAGENT => NL_UA, CURLOPT_COOKIEJAR => $cookies, CURLOPT_COOKIEFILE => $cookies, CURLOPT_ENCODING => '',
    CURLOPT_HTTPHEADER => ['Accept-Language: pt-PT,pt;q=0.9', 'Accept: text/html,application/xhtml+xml,*/*;q=0.8']];
  if ($referer !== '') $op[CURLOPT_REFERER] = $referer;
  if ($dados !== null) $op += [CURLOPT_POST => true, CURLOPT_POSTFIELDS => http_build_query($dados)];
  curl_setopt_array($c, $op);
  $b = (string)curl_exec($c); $h = (int)curl_getinfo($c, CURLINFO_HTTP_CODE); $f = (string)curl_getinfo($c, CURLINFO_EFFECTIVE_URL); curl_close($c);
  return [$h, $f ?: $url, $b];
}

function nl_texto(string $html): string {
  $t = preg_replace('#<(script|style|noscript)\b.*?</\1>#is', ' ', $html);
  return trim(preg_replace('/\s+/u', ' ', html_entity_decode(strip_tags($t), ENT_QUOTES | ENT_HTML5, 'UTF-8')));
}

// Segundo passo: na página que o link abriu, o botão «Confirmar»/«Subscrever» (formulário) ou um link «confirmar».
function nl_segundo_passo(string $final, string $pag): ?array {
  if (preg_match_all('#<form\b([^>]*)>(.*?)</form>#is', $pag, $ff, PREG_SET_ORDER)) foreach ($ff as $f) {
    $attrs = $f[1]; $corpo = $f[2];
    if (preg_match('/(g-recaptcha|h-captcha|cf-turnstile)/i', $corpo)) continue;
    if (preg_match('/(search|pesquis|login|password|unsubscri|cancel|anular|remov)/i', $attrs . ' ' . strip_tags($corpo, '<input><button>'))) continue;
    $botao = preg_match('#<(button|input)\b[^>]*(type\s*=\s*["\']?(submit|image)|<button)[^>]*>(.*?)(</button>)?#is', $corpo) ? $corpo : '';
    if (!preg_match(NL_LINK_SIM, nl_texto($corpo) . ' ' . $attrs . ' ' . $botao) && !preg_match('/(subscrev|guardar|save|update|atualizar|continuar|continue|submeter|submit|enviar)/iu', $botao)) continue;
    $dados = [];
    if (preg_match_all('#<(input|select|textarea)\b([^>]*)>#is', $corpo, $ii, PREG_SET_ORDER)) foreach ($ii as $in) {
      $a = $in[2]; if (!preg_match('/\bname\s*=\s*["\']?([^"\'\s>]+)/i', $a, $n)) continue; $nome = html_entity_decode($n[1]);
      $tipo = preg_match('/\btype\s*=\s*["\']?([a-z]+)/i', $a, $t) ? strtolower($t[1]) : ($in[1] === 'input' ? 'text' : $in[1]);
      $val = preg_match('/\bvalue\s*=\s*["\']([^"\']*)["\']/i', $a, $v) ? html_entity_decode($v[1], ENT_QUOTES) : '';
      if (in_array($tipo, ['submit', 'button', 'image', 'reset', 'file', 'password'], true)) { if ($tipo === 'submit' && $val !== '' && !isset($dados[$nome])) $dados[$nome] = $val; continue; }
      if ($tipo === 'checkbox') { if (preg_match('/(required|checked|rgpd|gdpr|consent|privacidade|termos|aceit|accept|autoriz|newsletter|agenda|evento|cultura|turismo)/i', $a . ' ' . $nome)) $dados[$nome] = $val ?: 'on'; continue; }
      if ($tipo === 'radio') { if (!isset($dados[$nome]) || preg_match('/checked/i', $a)) $dados[$nome] = $val; continue; }
      if ($tipo === 'email' || preg_match('/e-?mail/i', $nome)) { $dados[$nome] = $val ?: 'info@lykeion.pt'; continue; }
      if ($val === '' && preg_match('/(nome|name|fname|first)/i', $nome)) { $dados[$nome] = 'Lykeion'; continue; }
      $dados[$nome] = $val;
    }
    $acao = preg_match('/\baction\s*=\s*["\']([^"\']*)["\']/i', $attrs, $x) ? html_entity_decode($x[1]) : '';
    $metodo = preg_match('/\bmethod\s*=\s*["\']?post/i', $attrs) ? 'POST' : 'GET';
    return ['url' => nl_absoluto($final, $acao ?: $final), 'dados' => $dados, 'metodo' => $metodo];
  }
  foreach (nl_links($pag, '') as [$u, $txt]) // sem formulário: um link «Confirmar» na própria página
    if (preg_match('/(confirm|ativar|activ|valid)/iu', $txt) && !preg_match(NL_LINK_NAO, $u . ' ' . $txt)) return ['url' => nl_absoluto($final, $u), 'dados' => null, 'metodo' => 'GET'];
  return null;
}

function nl_absoluto(string $base, string $rel): string {
  if (preg_match('#^https?://#i', $rel)) return $rel;
  $p = parse_url($base); $raiz = ($p['scheme'] ?? 'https') . '://' . ($p['host'] ?? '') . (isset($p['port']) ? ':' . $p['port'] : '');
  if (str_starts_with($rel, '//')) return ($p['scheme'] ?? 'https') . ':' . $rel;
  if (str_starts_with($rel, '/')) return $raiz . $rel;
  if (str_starts_with($rel, '?')) return $raiz . ($p['path'] ?? '/') . $rel;
  return $raiz . preg_replace('#/[^/]*$#', '/', $p['path'] ?? '/') . $rel;
}

// Faz a confirmação completa: abre o link e, se a página pedir mais um clique, dá-o (até dois passos).
// Devolve [código, 'ok' | 'por confirmar' | 'falhou', nota].
function nl_confirmar(string $link): array {
  $cookies = tempnam(sys_get_temp_dir(), 'nl'); $nota = [];
  try {
    [$h, $final, $pag] = nl_pedido($link, null, $cookies);
    $nota[] = "1: $h";
    for ($i = 0; $i < 2 && $h >= 200 && $h < 400; $i++) {
      $txt = nl_texto($pag);
      if (preg_match(NL_FEITO, $txt, $m)) return [$h, 'ok', implode(' · ', $nota) . ' · «' . $m[0] . '»'];
      $passo = nl_segundo_passo($final, $pag);
      if (!$passo) break;
      if ($passo['metodo'] === 'GET' && $passo['dados']) { $passo['url'] .= (str_contains($passo['url'], '?') ? '&' : '?') . http_build_query($passo['dados']); $passo['dados'] = null; }
      [$h, $final, $pag] = nl_pedido($passo['url'], $passo['metodo'] === 'POST' ? $passo['dados'] : null, $cookies, $final);
      $nota[] = ($i + 2) . ': ' . $passo['metodo'] . " $h";
    }
    if ($h >= 200 && $h < 400 && preg_match(NL_FEITO, nl_texto($pag), $m)) return [$h, 'ok', implode(' · ', $nota) . ' · «' . $m[0] . '»'];
    return [$h, $h >= 200 && $h < 400 ? 'por confirmar' : 'falhou', implode(' · ', $nota) . ' · ' . mb_substr(nl_texto($pag), 0, 160)];
  } finally { @unlink($cookies); }
}

// Chamado pela caixa de entrada para cada email. Devolve o estado a dar ao email:
// 'newsletter' (confirmação feita ou newsletter normal), 'novo' (confirmação que não ficou garantida: vê-se à mão)
// ou '' (não é newsletter: fica como estava).
function nl_tratar(PDO $pdo, array $m): string {
  $link = nl_link_confirmacao($m);
  if ($link !== '') {
    nl_tabela($pdo);
    $ja = $pdo->prepare("SELECT COUNT(*) FROM nl_confirmacoes WHERE url = ? AND resultado = 'ok'"); $ja->execute([$link]);
    if ((int)$ja->fetchColumn()) return 'newsletter';
    [$http, $res, $nota] = nl_confirmar($link);
    $pdo->prepare('INSERT INTO nl_confirmacoes (de_email, assunto, url, http, em, resultado, nota) VALUES (?,?,?,?,?,?,?)')
      ->execute([$m['de_email'], mb_substr($m['assunto'], 0, 300), $link, $http, date('Y-m-d H:i'), $res, mb_substr($nota, 0, 500)]);
    return $res === 'ok' ? 'newsletter' : 'novo'; // sem a mensagem «subscrição confirmada» fica em «Para tratar»
  }
  if (!empty($m['lista'])) return 'newsletter'; // envio em massa (List-Unsubscribe/List-Id): não é resposta de ninguém
  return '';
}

// ---------- 3) Eventos das newsletters para a recolha diária ----------
// Cada newsletter fica com as suas ligações (url + texto) na coluna emails.ligacoes. Uma vez por dia, de madrugada,
// as newsletters dos últimos 21 dias vão para recolha/newsletters.json no ramo fonte, e o robô da recolha
// (ferramentas/recolher_eventos.py) tira de lá os eventos, que entram na triagem como os das agendas.
function nl_coluna_ligacoes(PDO $pdo): void {
  if (cx_estado('nl_col_ligacoes') === '1') return;
  $my = $pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql';
  try { $pdo->exec('ALTER TABLE emails ADD COLUMN ligacoes ' . ($my ? 'MEDIUMTEXT' : 'TEXT')); } catch (Throwable $e) {} // já existe
  cx_estado('nl_col_ligacoes', '1');
}

// Só as ligações que podem ser de um evento (fora: cancelar, redes sociais, imagens, «ver no navegador»).
function nl_ligacoes_evento(array $m): string {
  $r = []; $vistos = [];
  foreach (nl_links($m['html'] ?? '', $m['texto'] ?? '') as [$url, $txt]) {
    if (!preg_match('#^https?://#i', $url) || preg_match(NL_LINK_NAO, $url . ' ' . $txt)) continue;
    if (preg_match('/(ver (no|em) (navegador|browser)|view (in|this email in) (your )?browser|vers[aã]o (web|online))/iu', $txt)) continue;
    $txt = mb_substr(trim(preg_replace('/\s+/u', ' ', $txt)), 0, 300);
    $k = $url . '|' . $txt; if (isset($vistos[$k])) continue; $vistos[$k] = 1;
    $r[] = [mb_substr($url, 0, 1000), $txt];
    if (count($r) >= 300) break;
  }
  return json_encode($r, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}

// Uma vez por dia (a partir das 4h): grava recolha/newsletters.json na fonte, se mudou.
function nl_exportar(PDO $pdo, bool $forcar = false): string {
  $hoje = date('Y-m-d');
  if (!$forcar && (cx_estado('nl_exportado') === $hoje || (int)date('G') < 4)) return '';
  if (!function_exists('gh_ligado') || !gh_ligado()) return 'sem chave do GitHub';
  nl_coluna_ligacoes($pdo);
  $q = $pdo->prepare("SELECT uid, de_email, de_nome, assunto, data, texto, ligacoes FROM emails WHERE estado = 'newsletter' AND data >= ? ORDER BY data");
  $q->execute([date('Y-m-d', strtotime('-21 days'))]);
  $lista = [];
  foreach ($q->fetchAll(PDO::FETCH_ASSOC) as $e) {
    if (preg_match(NL_PEDIDO, $e['assunto']) && preg_match('/(confirm|valid|verifi|ativ|activ|bem.?vind|welcome|obrigad)/iu', $e['assunto'])) continue; // pedido de confirmação ou boas-vindas
    $lista[] = ['uid' => (int)$e['uid'], 'de_email' => $e['de_email'], 'de_nome' => $e['de_nome'], 'assunto' => $e['assunto'], 'data' => $e['data'],
                'texto' => mb_substr((string)$e['texto'], 0, 30000), 'ligacoes' => json_decode((string)($e['ligacoes'] ?? ''), true) ?: []];
  }
  $json = json_encode(['gerado_em' => date('Y-m-d H:i'), 'newsletters' => $lista], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT) . "\n";
  $h = md5(json_encode($lista));
  if ($h !== cx_estado('nl_exportado_hash')) {
    gh_gravar(['recolha/newsletters.json' => $json], 'Newsletters recebidas (' . $hoje . ', ' . count($lista) . ')');
    cx_estado('nl_exportado_hash', $h);
  }
  cx_estado('nl_exportado', $hoje);
  return count($lista) . ' newsletters';
}
