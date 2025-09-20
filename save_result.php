<?php
// H2Game — Save Result Endpoint (PHP)
// Stores posted JSON results into results.jsonl (prefer data/ subfolder) next to this file.
// If writing to the web root is not permitted, it falls back to a temp directory.

header('Content-Type: application/json; charset=utf-8');
// Allow simple cross-origin usage for demos; tighten for production if needed
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
  http_response_code(204);
  exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
  http_response_code(405);
  echo json_encode(['ok' => false, 'error' => 'Method not allowed']);
  exit;
}

$raw = file_get_contents('php://input');
if ($raw === false || $raw === '') {
  http_response_code(400);
  echo json_encode(['ok' => false, 'error' => 'Empty body']);
  exit;
}

$data = json_decode($raw, true);
if (!is_array($data)) {
  http_response_code(400);
  echo json_encode(['ok' => false, 'error' => 'Invalid JSON']);
  exit;
}

// Minimal normalization
$record = [
  'status'     => isset($data['status']) ? (string)$data['status'] : 'unknown',
  'name'       => isset($data['name']) ? (string)$data['name'] : '',
  'email'      => isset($data['email']) ? (string)$data['email'] : '',
  'rows'       => isset($data['rows']) ? (int)$data['rows'] : null,
  'columns'    => isset($data['columns']) ? (int)$data['columns'] : null,
  'hideMatched'=> !empty($data['hideMatched']) ? true : false,
  'slots'      => isset($data['slots']) ? (int)$data['slots'] : null,
  'score'      => isset($data['score']) ? (int)$data['score'] : null,
  'maxScore'   => isset($data['maxScore']) ? (int)$data['maxScore'] : null,
  'timeMs'     => isset($data['timeMs']) ? (int)$data['timeMs'] : null,
  'moves'      => isset($data['moves']) ? (int)$data['moves'] : null,
  'ts'         => isset($data['ts']) ? (int)$data['ts'] : (int) (microtime(true) * 1000),
  'serverTs'   => (int) (microtime(true) * 1000),
  'ip'         => $_SERVER['REMOTE_ADDR'] ?? null,
  'ua'         => $_SERVER['HTTP_USER_AGENT'] ?? null,
];

$jsonl = json_encode($record, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n";

// Choose a writable path
$candidates = [];
$dataDir = __DIR__ . DIRECTORY_SEPARATOR . 'data';
if (!is_dir($dataDir)) {
  // Try create data/ if possible
  @mkdir($dataDir, 0775, true);
}
// Prefer data/ then current dir
$candidates[] = $dataDir;
$candidates[] = __DIR__;

$written = false;
$usedPath = null;
foreach ($candidates as $dir) {
  if (!is_dir($dir) || !is_writable($dir)) continue;
  $path = $dir . DIRECTORY_SEPARATOR . 'results.jsonl';
  $fh = @fopen($path, 'ab');
  if ($fh) {
    $ok = true;
    if (function_exists('flock')) {
      $ok = flock($fh, LOCK_EX);
    }
    if ($ok) {
      $written = fwrite($fh, $jsonl) !== false;
      if (function_exists('flock')) {
        @flock($fh, LOCK_UN);
      }
      @fclose($fh);
      if ($written) { $usedPath = $path; break; }
    } else {
      @fclose($fh);
    }
  }
}

// Fall back to temp dir
if (!$written) {
  $tmp = rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'h2game-results.jsonl';
  $fh = @fopen($tmp, 'ab');
  if ($fh) {
    $ok = fwrite($fh, $jsonl) !== false;
    @fclose($fh);
    if ($ok) { $written = true; $usedPath = $tmp; header('X-Storage-Fallback: temp'); }
  }
}

if ($written) {
  if ($usedPath) header('X-Storage-Path: ' . basename(dirname($usedPath)) . '/' . basename($usedPath));
  http_response_code(201);
  echo json_encode(['ok' => true]);
} else {
  http_response_code(500);
  echo json_encode(['ok' => false, 'error' => 'Failed to write results file. Ensure the web user can write to ./data or this directory.']);
}
