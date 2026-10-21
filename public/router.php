<?php

$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?: '/';

if (preg_match('#^/api(/|$)#', $path)) {
    require __DIR__ . '/api/index.php';
    return true;
}

if (str_starts_with($path, '/uploads/') && preg_match('/\.(php\d?|phtml|phar)$/i', $path)) {
    http_response_code(403);
    return true;
}

return false;
