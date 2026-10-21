<?php

declare(strict_types=1);

// Loads classes from src/ (App\Foo\Bar => src/Foo/Bar.php), reads .env,
// and returns the config array.

spl_autoload_register(static function (string $class): void {
    $prefix = 'App\\';
    if (!str_starts_with($class, $prefix)) {
        return;
    }
    $file = __DIR__ . '/' . str_replace('\\', '/', substr($class, strlen($prefix))) . '.php';
    if (is_file($file)) {
        require $file;
    }
});

(static function (string $path): void {
    if (!is_file($path)) {
        return;
    }
    foreach (file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        $line = trim($line);
        if ($line === '' || $line[0] === '#' || !str_contains($line, '=')) {
            continue;
        }
        [$key, $value] = array_map('trim', explode('=', $line, 2));
        // Real environment variables win over .env.
        if (getenv($key) === false) {
            putenv($key . '=' . trim($value, "\"'"));
        }
    }
})(dirname(__DIR__) . '/.env');

return require __DIR__ . '/config.php';
