<?php
header('Content-Type: application/json');
echo json_encode([
    'HTTP_AUTHORIZATION'          => $_SERVER['HTTP_AUTHORIZATION'] ?? null,
    'REDIRECT_HTTP_AUTHORIZATION' => $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? null,
    'PHP_AUTH_USER'               => $_SERVER['PHP_AUTH_USER'] ?? null,
]);