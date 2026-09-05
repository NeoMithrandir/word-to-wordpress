<?php
// Temporary: check if Apache passed the Authorization header to PHP. DELETE after use.
header('Content-Type: application/json');
$auth = isset($_SERVER['HTTP_AUTHORIZATION']) ? $_SERVER['HTTP_AUTHORIZATION'] : (isset($_SERVER['REDIRECT_HTTP_AUTHORIZATION']) ? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] : null);
echo json_encode([
  'HTTP_AUTHORIZATION_set' => !empty($auth),
  'REDIRECT_HTTP_AUTHORIZATION_set' => !empty($_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? null),
]);