<?php

declare(strict_types=1);

namespace App\Controllers;

use App\HttpException;
use App\Repositories\DashboardRepository;
use App\Request;
use App\Response;
use App\Support\Uuid;
use App\Support\Validator;

final class DashboardController
{
    public function __construct(
        private readonly DashboardRepository $dashboards,
        private readonly Validator $validator,
    ) {}

    /** GET /api/dashboards */
    public function index(): void
    {
        Response::json(['data' => $this->dashboards->all()]);
    }

    /** GET /api/dashboards/{id} */
    public function show(array $params): void
    {
        $dashboard = $this->dashboards->find($this->checkId($params['id']));
        if ($dashboard === null) {
            throw new HttpException(404, 'Dashboard not found.');
        }
        Response::json(['data' => $dashboard]);
    }

    /** POST /api/dashboards  {name?} */
    public function store(): void
    {
        $body = Request::json();
        $name = $this->validator->dashboardName($body['name'] ?? 'Untitled dashboard');
        Response::json(['data' => $this->dashboards->create($name)], 201);
    }

    /** PUT /api/dashboards/{id}  {name, version, settings, sections[]} */
    public function update(array $params): void
    {
        $id = $this->checkId($params['id']);
        $layout = $this->validator->layout(Request::json());
        Response::json(['data' => $this->dashboards->saveLayout($id, $layout)]);
    }

    /** DELETE /api/dashboards/{id} */
    public function destroy(array $params): void
    {
        if (!$this->dashboards->delete($this->checkId($params['id']))) {
            throw new HttpException(404, 'Dashboard not found.');
        }
        Response::noContent();
    }

    private function checkId(string $id): string
    {
        if (!Uuid::isValid($id)) {
            throw new HttpException(404, 'Dashboard not found.');
        }
        return strtolower($id);
    }
}
