<?php

declare(strict_types=1);

namespace App;

final class Request
{
    private const MAX_BODY_BYTES = 2 * 1024 * 1024;

    public static function method(): string
    {
        return strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
    }

    public static function apiPath(): string
    {
        $path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
        if (!preg_match('#/api(?:/index\.php)?(/.*)?$#', $path, $match)) {
            return '/';
        }
        return rtrim($match[1] ?? '', '/') ?: '/';
    }

    public static function query(string $key): ?string
    {
        $value = $_GET[$key] ?? null;
        return is_string($value) ? $value : null;
    }

    public static function json(): array
    {
        $raw = (string) file_get_contents('php://input', length: self::MAX_BODY_BYTES + 1);
        if (strlen($raw) > self::MAX_BODY_BYTES) {
            throw new HttpException(413, 'The request body is too large.');
        }
        if (trim($raw) === '') {
            return [];
        }
        try {
            $data = json_decode($raw, true, 64, JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            throw new HttpException(400, 'The request body must be valid JSON.');
        }
        if (!is_array($data)) {
            throw new HttpException(400, 'The request body must be a JSON object.');
        }
        return $data;
    }
}
