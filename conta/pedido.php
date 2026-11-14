<?php
// Lykeion (14/11/2026, meta das 1 000): o pedido de eventos às instituições, de info@lykeion.pt, assinado «A equipa do Lykeion».
// Decisão do Paulo (12/11 «Realizados + pedir às instituições»; 14/11 «Sim, mas primeiro 20 de teste»).
// A lista vem do ramo fonte do código (recolha/lykeion_pedido.csv: id;nome;sigla;email;eventos;lote), que nunca vai para o
// repositório público: só as linhas do lote pedido são enviadas, cada email uma só vez (tabela ly_pedido).
//   GET ?enviar&lote=teste[&n=20] → envia até n emails desse lote ainda não enviados (no máximo 100 por dia, ao todo),
//                                   só se o lote estiver autorizado em recolha/lykeion_pedido_lotes.txt (uma linha por lote)
//   GET ?estado                   → contagens por lote (enviados, falhados), sem emails
// Só existe no lykeion.pt (gerar_lagenda.py --lykeion copia-o para conta/pedido.php).
foreach ([__DIR__ . '/../privado', __DIR__ . '/../../privado'] as $d) if (is_file("$d/db.php") && (is_file("$d/config.php") || (is_file("$d/config_caminho.php") && (include "$d/config_caminho.php")))) { require_once "$d/db.php"; $PRIV = $d; break; }
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Robots-Tag: noindex');
if (!function_exists('bd')) { http_response_code(503); exit(json_encode(['erro' => 'sem configuração'])); }
require_once "$PRIV/github.php";

const MAX_DIA = 100;
const SITE = 'https://lykeion.pt/';

function pd_bd(): PDO {
  static $ok = false; $pdo = bd();
  if (!$ok) {
    $cs = $pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql' ? ' DEFAULT CHARSET=utf8mb4' : '';
    $pdo->exec("CREATE TABLE IF NOT EXISTS ly_pedido (email VARCHAR(190) PRIMARY KEY, inst VARCHAR(80), lote VARCHAR(40), enviado_em CHAR(16), resultado VARCHAR(300))$cs");
    $ok = true;
  }
  return $pdo;
}

function pd_lista(): array {
  $csv = gh_ler('recolha/lykeion_pedido.csv');
  $linhas = array_values(array_filter(preg_split('/\r?\n/', $csv), 'strlen'));
  $cab = str_getcsv(ltrim(array_shift($linhas), "\xEF\xBB\xBF"), ';');
  $out = [];
  foreach ($linhas as $l) { $v = str_getcsv($l, ';'); if (count($v) === count($cab)) $out[] = array_combine($cab, $v); }
  return $out;
}

// Artigo: «a» para nomes femininos (Academia, Escola…), «o» para o resto (Centro, Departamento, siglas, nomes em inglês).
function pd_fem(string $nome): bool {
  return (bool)preg_match('/^(Academia|Associa[çc][ãa]o|Escola|Faculdade|Universidade|Funda[çc][ãa]o|Sociedade|Biblioteca|Unidade|Ordem|C[áa]tedra|Rede|Comiss[ãa]o|Casa|Cooperativa|Ag[êe]ncia|Federa[çc][ãa]o|Plataforma|Liga|Uni[ãa]o)\b/u', $nome);
}

function pd_texto(array $i): array {
  $nome = $i['nome']; $id = $i['id'];
  $curto = trim(explode(' — ', $nome)[0]);
  if (mb_strlen($curto) > 70 && $i['sigla'] !== '') $curto = $i['sigla'];
  $a = pd_fem($nome) ? 'a' : 'o'; $da = pd_fem($curto) ? 'da' : 'do';
  $pag = SITE . "i/$id/"; $propor = SITE . "conta/propor.php?i=$id"; $inc = SITE . "incorporar/?q=i/$id";
  $n = (int)$i['eventos'];
  $agora = $n > 0 ? "Neste momento mostramos $n " . ($n === 1 ? 'evento, lido' : 'eventos, lidos') . " no vosso site."
                  : "Ainda não conseguimos ler eventos futuros no vosso site.";
  $assunto = "Os eventos $da $curto no Lykeion, a agenda pública da ciência em Portugal";
  $t = "Bom dia,\n\n"
     . "O Lykeion (" . SITE . ") é uma agenda gratuita e aberta dos eventos da ciência em Portugal: conferências, seminários, aulas abertas, congressos, provas públicas e divulgação. Não tem publicidade nem destaques pagos. Publicamos só os factos de cada evento (título, data, hora, local e instituição) e uma ligação para a página oficial.\n\n"
     . ucfirst($a) . " $nome já tem página no Lykeion: $pag\n\n$agora\n\n"
     . "Para que os vossos eventos apareçam sempre, basta uma destas três coisas:\n\n"
     . "1. Dizer-nos qual é a página da vossa agenda de eventos, se tiverem uma (ou um calendário .ics ou RSS).\n"
     . "2. Pôr o endereço info@lykeion.pt na lista da vossa newsletter ou dos avisos de eventos.\n"
     . "3. Propor cada evento diretamente em $propor (um minuto, sem custos).\n\n"
     . "Também podem pôr a agenda do Lykeion da instituição no vosso site, sem custos: $inc\n\n"
     . "Se algum dado estiver errado ou se preferirem não aparecer, basta responder a este email.\n\n"
     . "Com os melhores cumprimentos,\nA equipa do Lykeion\nO encontro da ciência\ninfo@lykeion.pt · " . SITE . "\n";
  return [$assunto, $t];
}

$pdo = pd_bd();
if (isset($_GET['estado'])) {
  $r = [];
  foreach ($pdo->query('SELECT lote, resultado = \'ok\' AS ok, COUNT(*) AS n FROM ly_pedido GROUP BY lote, resultado = \'ok\'') as $x)
    $r[$x['lote']][$x['ok'] ? 'enviados' : 'falhados'] = (int)$x['n'];
  exit(json_encode(['lotes' => $r], JSON_UNESCAPED_UNICODE));
}
if (!isset($_GET['enviar']) || ($lote = preg_replace('/[^\w-]/', '', (string)($_GET['lote'] ?? ''))) === '') {
  http_response_code(400); exit(json_encode(['erro' => 'use ?enviar&lote=…']));
}
try { $autorizados = array_filter(array_map('trim', preg_split('/\r?\n/', gh_ler('recolha/lykeion_pedido_lotes.txt')))); } catch (Throwable $e) { $autorizados = []; }
if (!in_array($lote, $autorizados, true)) { http_response_code(403); exit(json_encode(['erro' => "lote $lote não autorizado"], JSON_UNESCAPED_UNICODE)); }
$hoje = date('Y-m-d');
$q = $pdo->prepare('SELECT COUNT(*) FROM ly_pedido WHERE enviado_em LIKE ?'); $q->execute(["$hoje%"]);
$feitos_hoje = (int)$q->fetchColumn();
$n = max(0, min((int)($_GET['n'] ?? 20), MAX_DIA - $feitos_hoje, 25));
try { $lista = pd_lista(); } catch (Throwable $e) { http_response_code(502); exit(json_encode(['erro' => $e->getMessage()], JSON_UNESCAPED_UNICODE)); }
$ja = array_flip($pdo->query('SELECT email FROM ly_pedido')->fetchAll(PDO::FETCH_COLUMN));
$enviados = 0; $falhas = [];
foreach ($lista as $i) {
  if ($enviados + count($falhas) >= $n) break;
  $e = strtolower(trim($i['email'] ?? ''));
  if (($i['lote'] ?? '') !== $lote || !filter_var($e, FILTER_VALIDATE_EMAIL) || isset($ja[$e])) continue;
  [$assunto, $txt] = pd_texto($i);
  [$ok, $erro] = enviar_email($e, $assunto, $txt, 'info@lykeion.pt', 'Lykeion');
  $pdo->prepare('INSERT INTO ly_pedido (email, inst, lote, enviado_em, resultado) VALUES (?,?,?,?,?)')
      ->execute([$e, $i['id'], $lote, date('Y-m-d H:i'), $ok ? 'ok' : mb_substr((string)$erro, 0, 290)]);
  if ($ok) $enviados++; else $falhas[] = $i['id'];
  usleep(1500000);
}
$q = $pdo->prepare('SELECT COUNT(*) FROM ly_pedido WHERE lote = ?'); $q->execute([$lote]);
$faltam = count(array_filter($lista, fn($i) => ($i['lote'] ?? '') === $lote)) - (int)$q->fetchColumn();
echo json_encode(['lote' => $lote, 'enviados' => $enviados, 'falhados' => $falhas, 'faltam' => max(0, $faltam), 'hoje' => $feitos_hoje + $enviados], JSON_UNESCAPED_UNICODE);
