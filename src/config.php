<?php

declare(strict_types=1);

$env = static fn (string $key, string $default = ''): string => getenv($key) === false ? $default : getenv($key);

return [
    'debug' => filter_var($env('APP_DEBUG', 'false'), FILTER_VALIDATE_BOOL),
    'db' => [
        'host' => $env('DB_HOST', '127.0.0.1'),
        'port' => (int) $env('DB_PORT', '3306'),
        'name' => $env('DB_NAME', 'dashboard_builder'),
        'user' => $env('DB_USER', 'root'),
        'pass' => $env('DB_PASS', ''),
    ],
    'uploads' => [
        'dir' => dirname(__DIR__) . '/public/uploads',
        // Relative to public/index.html, so the app works from any sub-folder.
        'url_prefix' => 'uploads/',
        'max_bytes' => 5 * 1024 * 1024,
    ],
];
