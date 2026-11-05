<?php
// Ligação do servidor ao GitHub: lê e grava ficheiros no ramo "fonte" de aquiaolado/asfeiras.
// Cada gravação na fonte faz o GitHub correr o gerar.py e publicar o site (.github/workflows/publicar.yml).
// A chave (token) fica na base de dados (tabela nucleo_estado), guardada pela página "Ligação ao GitHub" da gestão,
// ou em privado/config.php como 'github_token'.
const GH_REPO = 'aquiaolado/asfeiras';
define('GH_RAMO', (string)($GLOBALS['CFG']['github_ramo'] ?? 'fonte')); // outro ramo só para testes

function gh_estado_tab(PDO $pdo): void {
  $pdo->exec('CREATE TABLE IF NOT EXISTS nucleo_estado (chave VARCHAR(40) PRIMARY KEY, valor TEXT)'
    . ($pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql' ? ' DEFAULT CHARSET=utf8mb4' : ''));
}
function gh_token(): string {
  global $CFG;
  if (!empty($CFG['github_token'])) return (string)$CFG['github_token'];
  try { $pdo = bd(); gh_estado_tab($pdo); $q = $pdo->prepare('SELECT valor FROM nucleo_estado WHERE chave = ?'); $q->execute(['github_token']); return (string)$q->fetchColumn(); }
  catch (Throwable $e) { return ''; }
}
function gh_guardar_token(string $t): void {
  $pdo = bd(); gh_estado_tab($pdo);
  $pdo->prepare('DELETE FROM nucleo_estado WHERE chave = ?')->execute(['github_token']);
  if ($t !== '') $pdo->prepare('INSERT INTO nucleo_estado (chave, valor) VALUES (?,?)')->execute(['github_token', $t]);
}
function gh_ligado(): bool { return gh_token() !== ''; }
// Só para testes fora do servidor: config 'github_teste_dir' = pasta com uma cópia da fonte.
function gh_dir_teste(): string { return (string)($GLOBALS['CFG']['github_teste_dir'] ?? ''); }

// Pedido à API do GitHub. Devolve [código HTTP, corpo (array JSON ou texto)].
function gh_api(string $metodo, string $caminho, $dados = null, bool $cru = false, ?string $token = null): array {
  $token ??= gh_token();
  if ($token === '') throw new RuntimeException('O servidor ainda não está ligado ao GitHub (gestão → Ligação ao GitHub).');
  $c = curl_init('https://api.github.com' . $caminho);
  $cab = ['Authorization: Bearer ' . $token, 'User-Agent: asfeiras.pt', 'X-GitHub-Api-Version: 2022-11-28',
          'Accept: ' . ($cru ? 'application/vnd.github.raw' : 'application/vnd.github+json')];
  if ($dados !== null) { $cab[] = 'Content-Type: application/json'; curl_setopt($c, CURLOPT_POSTFIELDS, json_encode($dados, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)); }
  curl_setopt_array($c, [CURLOPT_CUSTOMREQUEST => $metodo, CURLOPT_HTTPHEADER => $cab, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 60, CURLOPT_CONNECTTIMEOUT => 10]);
  $corpo = curl_exec($c); $cod = (int)curl_getinfo($c, CURLINFO_RESPONSE_CODE); $erro = curl_error($c); curl_close($c);
  if ($corpo === false) throw new RuntimeException('Sem ligação ao GitHub: ' . $erro);
  return [$cod, $cru && $cod < 300 ? $corpo : (json_decode($corpo, true) ?? $corpo)];
}
function gh_falha(string $o_que, array $r): RuntimeException {
  $m = is_array($r[1]) ? ($r[1]['message'] ?? '') : '';
  $dica = $r[0] === 401 ? ' A chave está errada ou caducou: crie outra e cole-a em «Ligação ao GitHub».'
        : ($r[0] === 403 || $r[0] === 404 ? ' A chave não tem as permissões certas para o repositório asfeiras.' : '');
  return new RuntimeException("$o_que falhou (GitHub respondeu {$r[0]}" . ($m ? ": $m" : '') . ").$dica");
}

// Lê um ficheiro da fonte tal como está agora no GitHub.
function gh_ler(string $caminho): string {
  if ($d = gh_dir_teste()) { $c = @file_get_contents("$d/$caminho"); if ($c === false) throw new RuntimeException("Não existe $caminho"); return $c; }
  $r = gh_api('GET', '/repos/' . GH_REPO . '/contents/' . str_replace('%2F', '/', rawurlencode($caminho)) . '?ref=' . GH_RAMO, null, true);
  if ($r[0] !== 200) throw gh_falha("Ler $caminho do GitHub", $r);
  return $r[1];
}

// Grava vários ficheiros num só registo (commit) no ramo fonte. $ficheiros = [caminho => conteúdo].
// $alterar, se dado, recebe o conteúdo atual de cada ficheiro e devolve o novo: assim, se outra gravação
// chegar entre a leitura e a escrita, volta a ler e a aplicar a alteração (até 3 vezes) sem perder nada.
function gh_gravar(array $ficheiros, string $mensagem, ?callable $alterar = null): string {
  if ($d = gh_dir_teste()) { // testes locais: grava numa cópia da fonte em vez do GitHub
    foreach (($alterar ? $alterar() : $ficheiros) as $cam => $c) { if ($c === null) @unlink("$d/$cam"); else { @mkdir(dirname("$d/$cam"), 0777, true); file_put_contents("$d/$cam", $c); } }
    return 'teste';
  }
  $base = '/repos/' . GH_REPO . '/git';
  for ($tentativa = 1; $tentativa <= 3; $tentativa++) {
    $r = gh_api('GET', "$base/ref/heads/" . GH_RAMO); if ($r[0] !== 200) throw gh_falha('Ler o ramo fonte', $r);
    $pai = $r[1]['object']['sha'];
    $r = gh_api('GET', "$base/commits/$pai"); if ($r[0] !== 200) throw gh_falha('Ler o último registo', $r);
    $arvore = $r[1]['tree']['sha'];
    $novos = $alterar ? $alterar() : $ficheiros;
    $itens = [];
    foreach ($novos as $cam => $conteudo) {
      if ($conteudo === null) { $itens[] = ['path' => $cam, 'mode' => '100644', 'type' => 'blob', 'sha' => null]; continue; } // apagar
      $b = gh_api('POST', "$base/blobs", ['content' => base64_encode($conteudo), 'encoding' => 'base64']);
      if ($b[0] !== 201) throw gh_falha("Enviar $cam", $b);
      $itens[] = ['path' => $cam, 'mode' => '100644', 'type' => 'blob', 'sha' => $b[1]['sha']];
    }
    $t = gh_api('POST', "$base/trees", ['base_tree' => $arvore, 'tree' => $itens]); if ($t[0] !== 201) throw gh_falha('Montar a alteração', $t);
    $c = gh_api('POST', "$base/commits", ['message' => $mensagem, 'tree' => $t[1]['sha'], 'parents' => [$pai],
      'author' => ['name' => 'asfeiras (gestão)', 'email' => 'todas@asfeiras.pt']]);
    if ($c[0] !== 201) throw gh_falha('Registar a alteração', $c);
    $u = gh_api('PATCH', "$base/refs/heads/" . GH_RAMO, ['sha' => $c[1]['sha'], 'force' => false]);
    if ($u[0] === 200) return $c[1]['sha'];
    if ($u[0] !== 422 || !$alterar) throw gh_falha('Gravar no ramo fonte', $u); // 422 = alguém gravou entretanto
  }
  throw new RuntimeException('Não consegui gravar: o ramo fonte estava sempre a mudar. Tente outra vez daqui a um minuto.');
}

// Estado da última publicação automática (precisa da permissão Actions: leitura na chave).
function gh_ultima_publicacao(): ?array {
  try {
    $r = gh_api('GET', '/repos/' . GH_REPO . '/actions/workflows/publicar.yml/runs?per_page=1');
    if ($r[0] !== 200 || empty($r[1]['workflow_runs'][0])) return null;
    $x = $r[1]['workflow_runs'][0];
    return ['estado' => $x['status'], 'resultado' => $x['conclusion'], 'quando' => $x['created_at'], 'url' => $x['html_url']];
  } catch (Throwable $e) { return null; }
}

// ---- feiras.csv: ler, encontrar e substituir uma linha sem tocar nas outras ----

// O mesmo código (slug) que o gerar.py dá a cada feira: nome; se repetido, nome + concelho.
function fc_slug(string $s): string {
  if (class_exists('Normalizer')) $s = preg_replace('/[^\x00-\x7F]/', '', Normalizer::normalize($s, Normalizer::FORM_D));
  else $s = iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $s);
  return trim(preg_replace('/[^a-z0-9]+/', '-', strtolower($s)), '-');
}

// Divide o CSV em registos, guardando o texto original de cada um (para regravar só o que muda).
function fc_ler(string $csv): array {
  $bom = str_starts_with($csv, "\xEF\xBB\xBF"); if ($bom) $csv = substr($csv, 3);
  $fim = str_contains($csv, "\r\n") ? "\r\n" : "\n";
  $regs = []; $i = 0; $n = strlen($csv);
  while ($i < $n) {
    $j = $i; $aspas = false;
    while ($j < $n) {
      $ch = $csv[$j];
      if ($ch === '"') $aspas = !$aspas;
      elseif (!$aspas && ($ch === "\n" || ($ch === "\r" && ($csv[$j + 1] ?? '') === "\n"))) break;
      $j++;
    }
    $texto = substr($csv, $i, $j - $i);
    $regs[] = $texto;
    $i = $j + (($csv[$j] ?? '') === "\r" ? 2 : 1);
  }
  $cab = str_getcsv(array_shift($regs), ';', '"', '');
  $linhas = [];
  foreach ($regs as $t) { if (trim($t) === '') continue; $v = str_getcsv($t, ';', '"', ''); $linhas[] = ['texto' => $t, 'v' => array_combine($cab, array_pad(array_slice($v, 0, count($cab)), count($cab), ''))]; }
  // códigos das feiras, como no gerar.py
  $usados = [];
  foreach ($linhas as &$l) {
    $l['slug'] = '';
    if (trim($l['v']['nome']) === '') continue;
    $s = fc_slug($l['v']['nome']); if (isset($usados[$s])) $s = fc_slug($l['v']['nome'] . ' ' . $l['v']['concelho']);
    $usados[$s] = 1; $l['slug'] = $s;
  }
  return ['bom' => $bom, 'fim' => $fim, 'cab' => $cab, 'linhas' => $linhas];
}

// Um campo escrito como o Python escreve (aspas só quando é preciso).
function fc_campo(string $v): string {
  return preg_match('/[;"\r\n]/', $v) ? '"' . str_replace('"', '""', $v) . '"' : $v;
}
function fc_linha(array $cab, array $v): string { return implode(';', array_map(fn($c) => fc_campo((string)($v[$c] ?? '')), $cab)); }

function fc_escrever(array $d): string {
  $out = [implode(';', array_map('fc_campo', $d['cab']))];
  foreach ($d['linhas'] as $l) $out[] = $l['texto'];
  return ($d['bom'] ? "\xEF\xBB\xBF" : '') . implode($d['fim'], $out) . $d['fim'];
}

// ---- Validação de uma linha do feiras.csv (o que o gerar.py exige, para uma gravação nunca deixar o site por publicar) ----
function fc_concelhos(): array { return array_keys(@json_decode(@file_get_contents(__DIR__ . '/concelhos.json'), true) ?: []); }

// Verifica o que o gerar.py exige, para uma gravação nunca deixar o site por publicar.
function fc_validar(array $v): array {
  $e = [];
  if (trim($v['nome']) === '') $e[] = 'Falta o nome.';
  if (!in_array($v['concelho'], fc_concelhos(), true)) $e[] = 'Concelho desconhecido: escolha um da lista.';
  if ($v['dias'] !== '' && !preg_match('/^[0-6](,[0-6])*$/', $v['dias'])) $e[] = 'Dias da semana: só números de 0 a 6 separados por vírgula.';
  if ($v['semanas'] !== '' && $v['semanas'] !== 'A' && !preg_match('/^([1-5]|L)(,([1-5]|L))*$/', $v['semanas'])) $e[] = 'Semanas do mês: A, ou números de 1 a 5 e L separados por vírgula.';
  if ($v['meses'] !== '' && !preg_match('/^([1-9]|1[0-2])(,([1-9]|1[0-2]))*$/', $v['meses'])) $e[] = 'Meses: números de 1 a 12 separados por vírgula.';
  $dm = $v['dia_do_mes'];
  $data = '\d{4}-\d{2}-\d{2}';
  if ($dm !== '' && !preg_match("/^(q14:$data|datas:$data(\.\.$data)?(,\s*$data(\.\.$data)?)*|\d{1,2}(,\d{1,2})*[!<]|\d{1,2})$/", $dm)) $e[] = 'Dia do mês ou datas marcadas: formato não reconhecido (veja a ajuda).';
  if ($v['excluir_datas'] !== '' && !preg_match('/^(\d{4}-)?\d{2}-\d{2}(,(\d{4}-)?\d{2}-\d{2})*$/', $v['excluir_datas'])) $e[] = 'Exceções: mês-dia (todos os anos) ou ano-mês-dia (só esse dia), separados por vírgula (12-25,2026-12-20).';
  if ($v['destaque'] !== '' && !preg_match('/^[0-3]$/', $v['destaque'])) $e[] = 'Destaque: de 0 a 3.';
  if (($v['canceladas'] ?? '') !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}\b[^;]*(;\s*\d{4}-\d{2}-\d{2}\b[^;]*)*$/', $v['canceladas'])) $e[] = 'Edições canceladas: «AAAA-MM-DD: motivo», separadas por ponto e vírgula.';
  foreach (['lat', 'lon'] as $c) if ($v[$c] !== '' && !is_numeric($v[$c])) $e[] = ($c === 'lat' ? 'Latitude' : 'Longitude') . ': tem de ser um número (com ponto).';
  if ($v['verificada_em'] !== '' && !preg_match('/^\d{4}-\d{2}$/', $v['verificada_em'])) $e[] = 'Confirmada em: ano-mês, ex.: 2026-10.';
  return $e;
}

