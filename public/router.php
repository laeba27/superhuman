<?php

// Router for PHP's built-in server (local development only; Apache uses .htaccess):
//   php -S localhost:8000 -t public public/router.php

$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?: '/';

if (preg_match('#^/api(/|$)#', $path)) {
    require __DIR__ . '/api/index.php';
    return true;
}

// Never run scripts from the uploads folder.
if (str_starts_with($path, '/uploads/') && preg_match('/\.(php\d?|phtml|phar)$/i', $path)) {
    http_response_code(403);
    return true;
}

return false; // serve the static file as-is
