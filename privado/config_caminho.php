<?php
// Devolve o caminho do config.php (ou '' se não houver). Usa-se com: $c = include __DIR__ . '/config_caminho.php';
// Procura: aqui; numa pasta privado/ ao lado do public_html (a publicação do Hostinger apaga o public_html/privado/config.php);
// e, no Hostinger, em /home/<conta>/domains/<site>/privado/, que não depende de como o public_html está ligado
// (a 7/11/2026 o lagenda.pt não encontrava domains/lagenda.pt/privado/config.php só pelo caminho relativo).
$h = preg_match('#^(/home/[^/]+)/#', (string) __DIR__, $m) ? $m[1] : '';
$s = strtolower((string) preg_replace('/^www\./i', '', (string) ($_SERVER['SERVER_NAME'] ?? $_SERVER['HTTP_HOST'] ?? '')));
$s = preg_match('/^[a-z0-9.-]+$/', $s) ? $s : '';
$dr = (string) ($_SERVER['DOCUMENT_ROOT'] ?? '');
foreach (array_filter([
  __DIR__ . '/config.php',
  dirname(__DIR__, 2) . '/privado/config.php',
  $dr !== '' ? dirname($dr) . '/privado/config.php' : '',
  ($h !== '' && $s !== '') ? "$h/domains/$s/privado/config.php" : '',
]) as $c) if (@is_file($c)) return $c;
return '';
