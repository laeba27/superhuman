<?php

declare(strict_types=1);

namespace App\Repositories;

use App\Database;
use App\HttpException;
use App\Support\Uuid;

final class DashboardRepository
{
    private const DEFAULT_SETTINGS = ['background' => '#f4f5f7', 'gridSize' => 8, 'snapToGrid' => true];

    public function __construct(private readonly Database $db) {}

    public function all(): array
    {
        $rows = $this->db->pdo()->query(
            'SELECT d.id, d.name, d.version, d.updated_at,
                    COUNT(DISTINCT s.id) AS section_count, COUNT(e.id) AS element_count
             FROM dashboards d
             LEFT JOIN sections s ON s.dashboard_id = d.id
             LEFT JOIN elements e ON e.section_id = s.id
             GROUP BY d.id
             ORDER BY d.updated_at DESC, d.name'
        )->fetchAll();

        return array_map(static fn (array $row): array => [
            'id' => $row['id'],
            'name' => $row['name'],
            'version' => (int) $row['version'],
            'updatedAt' => self::isoTime($row['updated_at']),
            'sectionCount' => (int) $row['section_count'],
            'elementCount' => (int) $row['element_count'],
        ], $rows);
    }

    /** The full layout tree: dashboard → sections → elements. */
    public function find(string $id): ?array
    {
        $pdo = $this->db->pdo();

        $stmt = $pdo->prepare('SELECT * FROM dashboards WHERE id = ?');
        $stmt->execute([$id]);
        $dashboard = $stmt->fetch();
        if ($dashboard === false) {
            return null;
        }

        $stmt = $pdo->prepare('SELECT * FROM sections WHERE dashboard_id = ? ORDER BY sort_order');
        $stmt->execute([$id]);
        $sections = [];
        foreach ($stmt as $row) {
            $sections[$row['id']] = [
                'id' => $row['id'],
                ...self::box($row),
                'style' => self::decode($row['style']),
                'elements' => [],
            ];
        }

        $stmt = $pdo->prepare(
            'SELECT e.* FROM elements e
             JOIN sections s ON s.id = e.section_id
             WHERE s.dashboard_id = ?
             ORDER BY e.sort_order'
        );
        $stmt->execute([$id]);
        foreach ($stmt as $row) {
            $sections[$row['section_id']]['elements'][] = [
                'id' => $row['id'],
                'type' => $row['type'],
                ...self::box($row),
                'style' => self::decode($row['style']),
                'content' => self::decode($row['content']),
            ];
        }

        return [
            'id' => $dashboard['id'],
            'name' => $dashboard['name'],
            'canvasWidth' => (int) $dashboard['canvas_width'],
            'settings' => self::decode($dashboard['settings']),
            'version' => (int) $dashboard['version'],
            'createdAt' => self::isoTime($dashboard['created_at']),
            'updatedAt' => self::isoTime($dashboard['updated_at']),
            'sections' => array_values($sections),
        ];
    }

    public function create(string $name): array
    {
        $id = Uuid::v4();
        $this->db->pdo()
            ->prepare('INSERT INTO dashboards (id, name, settings) VALUES (?, ?, ?)')
            ->execute([$id, $name, self::encode(self::DEFAULT_SETTINGS)]);
        return $this->find($id);
    }

    /**
     * Replaces the dashboard's sections and elements with $layout in one
     * transaction. Fails with 409 if someone saved a newer version first.
     */
    public function saveLayout(string $id, array $layout): array
    {
        $pdo = $this->db->pdo();
        $pdo->beginTransaction();
        try {
            $stmt = $pdo->prepare('SELECT version FROM dashboards WHERE id = ? FOR UPDATE');
            $stmt->execute([$id]);
            $current = $stmt->fetchColumn();
            if ($current === false) {
                throw new HttpException(404, 'Dashboard not found.');
            }
            if ((int) $current !== $layout['version']) {
                throw new HttpException(
                    409,
                    'This dashboard was saved somewhere else since you opened it. Reload to get the latest version.',
                    ['currentVersion' => (int) $current],
                );
            }

            $pdo->prepare('UPDATE dashboards SET name = ?, settings = ?, version = version + 1 WHERE id = ?')
                ->execute([$layout['name'], self::encode($layout['settings']), $id]);

            // Elements go with their sections (ON DELETE CASCADE).
            $pdo->prepare('DELETE FROM sections WHERE dashboard_id = ?')->execute([$id]);

            $insertSection = $pdo->prepare(
                'INSERT INTO sections (id, dashboard_id, x, y, width, height, z_index, style, sort_order)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
            );
            $insertElement = $pdo->prepare(
                'INSERT INTO elements (id, section_id, type, x, y, width, height, z_index, style, content, sort_order)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
            );
            foreach ($layout['sections'] as $sectionOrder => $s) {
                $insertSection->execute([
                    $s['id'], $id, $s['x'], $s['y'], $s['width'], $s['height'], $s['zIndex'],
                    self::encode($s['style']), $sectionOrder,
                ]);
                foreach ($s['elements'] as $elementOrder => $e) {
                    $insertElement->execute([
                        $e['id'], $s['id'], $e['type'], $e['x'], $e['y'], $e['width'], $e['height'], $e['zIndex'],
                        self::encode($e['style']), self::encode($e['content']), $elementOrder,
                    ]);
                }
            }

            $pdo->commit();
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            // 23000 = an id already belongs to another dashboard.
            if ($e instanceof \PDOException && $e->getCode() === '23000') {
                throw new HttpException(422, 'A section or element id is already used by another dashboard.');
            }
            throw $e;
        }

        return $this->find($id);
    }

    public function delete(string $id): bool
    {
        $stmt = $this->db->pdo()->prepare('DELETE FROM dashboards WHERE id = ?');
        $stmt->execute([$id]);
        return $stmt->rowCount() > 0;
    }

    private static function box(array $row): array
    {
        return [
            'x' => (int) $row['x'],
            'y' => (int) $row['y'],
            'width' => (int) $row['width'],
            'height' => (int) $row['height'],
            'zIndex' => (int) $row['z_index'],
        ];
    }

    /** Decodes to objects (not arrays) so an empty `{}` stays `{}` in the response. */
    private static function decode(string $json): mixed
    {
        return json_decode($json, false, 512, JSON_THROW_ON_ERROR);
    }

    private static function encode(mixed $value): string
    {
        return json_encode($value, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    }

    private static function isoTime(string $timestamp): string
    {
        return str_replace(' ', 'T', $timestamp) . 'Z';
    }
}
