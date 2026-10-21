<?php

declare(strict_types=1);

namespace App;

/** An error that should reach the client as a JSON response with this status. */
final class HttpException extends \RuntimeException
{
    public function __construct(
        public readonly int $status,
        string $message,
        public readonly array $details = [],
    ) {
        parent::__construct($message);
    }
}
