<?php

declare(strict_types=1);

namespace App;

/** Opens the MySQL connection the first time it's needed. */
final class Database
{
    private ?\PDO $pdo = null;

    public function __construct(private readonly array $config) {}

    public function pdo(): \PDO
    {
        if ($this->pdo !== null) {
            return $this->pdo;
        }

        $c = $this->config;
        $dsn = sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', $c['host'], $c['port'], $c['name']);
        try {
            $this->pdo = new \PDO($dsn, $c['user'], $c['pass'], [
                \PDO::ATTR_ERRMODE => \PDO::ERRMODE_EXCEPTION,
                \PDO::ATTR_DEFAULT_FETCH_MODE => \PDO::FETCH_ASSOC,
                \PDO::ATTR_EMULATE_PREPARES => false,
            ]);
        } catch (\PDOException $e) {
            error_log('Database connection failed: ' . $e->getMessage());
            throw new HttpException(503, 'Could not connect to the database. Check the DB_* settings in .env.');
        }
        // Store and return timestamps in UTC.
        $this->pdo->exec("SET time_zone = '+00:00'");

        return $this->pdo;
    }
}
