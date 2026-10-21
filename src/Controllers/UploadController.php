<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Database;
use App\HttpException;
use App\Response;

final class UploadController
{
    /** Detected MIME type => extension we save the file with. */
    private const TYPES = [
        'image/png' => 'png',
        'image/jpeg' => 'jpg',
        'image/gif' => 'gif',
        'image/webp' => 'webp',
    ];

    public function __construct(
        private readonly Database $db,
        private readonly array $config,
    ) {}

    /** POST /api/uploads  multipart/form-data with an "image" field */
    public function store(): void
    {
        $file = $_FILES['image'] ?? null;
        if (!is_array($file) || !is_int($file['error'] ?? null)) {
            throw new HttpException(400, 'Send one image file in the "image" form field.');
        }

        $maxMb = $this->config['max_bytes'] / 1024 / 1024;
        match ($file['error']) {
            UPLOAD_ERR_OK => null,
            UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE => throw new HttpException(413, "Images must be $maxMb MB or smaller."),
            UPLOAD_ERR_NO_FILE => throw new HttpException(400, 'Send one image file in the "image" form field.'),
            default => throw new HttpException(500, 'The upload failed on the server.'),
        };
        if ($file['size'] > $this->config['max_bytes']) {
            throw new HttpException(413, "Images must be $maxMb MB or smaller.");
        }

        // Trust the file's contents, not its name or the browser's Content-Type.
        $mime = (new \finfo(FILEINFO_MIME_TYPE))->file($file['tmp_name']);
        $extension = self::TYPES[$mime] ?? throw new HttpException(415, 'Only PNG, JPEG, GIF and WebP images are allowed.');
        $dimensions = @getimagesize($file['tmp_name']);
        if ($dimensions === false) {
            throw new HttpException(415, 'The file is not a readable image.');
        }

        $dir = $this->config['dir'];
        if (!is_dir($dir) && !mkdir($dir, 0755, true)) {
            throw new HttpException(500, 'The uploads folder is missing and could not be created.');
        }
        $filename = bin2hex(random_bytes(16)) . '.' . $extension;
        $path = "$dir/$filename";
        if (!move_uploaded_file($file['tmp_name'], $path)) {
            throw new HttpException(500, 'Could not store the uploaded image.');
        }

        try {
            $pdo = $this->db->pdo();
            $pdo->prepare(
                'INSERT INTO uploads (filename, original_name, mime_type, size_bytes, width, height)
                 VALUES (?, ?, ?, ?, ?, ?)'
            )->execute([
                $filename,
                mb_substr(basename((string) $file['name']), 0, 255),
                $mime,
                $file['size'],
                $dimensions[0],
                $dimensions[1],
            ]);
            $id = (int) $pdo->lastInsertId();
        } catch (\Throwable $e) {
            @unlink($path);
            throw $e;
        }

        Response::json(['data' => [
            'id' => $id,
            'url' => $this->config['url_prefix'] . $filename,
            'width' => $dimensions[0],
            'height' => $dimensions[1],
            'mimeType' => $mime,
            'sizeBytes' => $file['size'],
        ]], 201);
    }
}
