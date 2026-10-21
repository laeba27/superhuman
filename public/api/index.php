<?php

declare(strict_types=1);

// Single entry point for every /api/* request.

use App\Controllers\ChartDataController;
use App\Controllers\DashboardController;
use App\Controllers\UploadController;
use App\Database;
use App\HttpException;
use App\Repositories\DashboardRepository;
use App\Request;
use App\Response;
use App\Router;
use App\Support\HtmlSanitizer;
use App\Support\Validator;

$config = require dirname(__DIR__, 2) . '/src/bootstrap.php';

ini_set('display_errors', '0');

set_error_handler(static function (int $severity, string $message, string $file, int $line): bool {
    if (!(error_reporting() & $severity)) {
        return false;
    }
    throw new ErrorException($message, 0, $severity, $file, $line);
});

set_exception_handler(static function (Throwable $e) use ($config): void {
    if ($e instanceof HttpException) {
        Response::json(['error' => ['message' => $e->getMessage(), ...$e->details]], $e->status);
        return;
    }
    error_log((string) $e);
    $message = $config['debug'] ? $e->getMessage() : 'Something went wrong on the server.';
    Response::json(['error' => ['message' => $message]], 500);
});

$db = new Database($config['db']);
$dashboards = new DashboardController(new DashboardRepository($db), new Validator(new HtmlSanitizer()));
$uploads = new UploadController($db, $config['uploads']);
$charts = new ChartDataController();

$router = new Router();
$router->get('/dashboards', $dashboards->index(...));
$router->post('/dashboards', $dashboards->store(...));
$router->get('/dashboards/{id}', $dashboards->show(...));
$router->put('/dashboards/{id}', $dashboards->update(...));
$router->delete('/dashboards/{id}', $dashboards->destroy(...));
$router->post('/uploads', $uploads->store(...));
$router->get('/chart-data', $charts->show(...));
$router->get('/chart-data/metrics', $charts->metrics(...));

$router->dispatch(Request::method(), Request::apiPath());
