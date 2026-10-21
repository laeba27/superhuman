<?php

declare(strict_types=1);

namespace App\Support;

use App\HttpException;

final class Validator
{
    private const MAX_SECTIONS = 50;
    private const MAX_ELEMENTS_PER_SECTION = 100;
    private const MAX_COORD = 20000;
    private const MIN_SIZE = 16;
    private const MAX_TEXT_HTML = 50000;
    private const MAX_ERRORS = 50;
    private const MAX_RADIUS = 200;
    private const SHADOWS = ['none', 'sm', 'md', 'lg', 'glow'];
    private const COLOR = '/^(#[0-9a-f]{3,8}|transparent|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*(0|1|0?\.\d+)\s*)?\))$/i';
    private const IMAGE_SRC = '#^(uploads|assets/img)/[A-Za-z0-9][A-Za-z0-9._-]*\.(png|jpe?g|gif|webp|svg)$#i';

    private array $errors = [];
    private array $seenIds = [];

    public function __construct(private readonly HtmlSanitizer $sanitizer) {}

    public function dashboardName(mixed $value): string
    {
        $this->reset();
        $name = $this->string($value, 'name', 1, 120);
        $this->throwIfInvalid();
        return $name;
    }

    public function layout(array $input): array
    {
        $this->reset();
        $layout = [
            'name' => $this->string($input['name'] ?? null, 'name', 1, 120),
            'version' => $this->integer($input['version'] ?? null, 'version', 1, PHP_INT_MAX),
            'settings' => $this->settings($input['settings'] ?? [], 'settings'),
            'sections' => [],
        ];
        foreach ($this->list($input['sections'] ?? null, 'sections', self::MAX_SECTIONS) as $i => $section) {
            $layout['sections'][] = $this->section($section, "sections[$i]");
        }
        $this->throwIfInvalid();
        return $layout;
    }

    private function settings(mixed $value, string $path): array
    {
        $value = $this->object($value, $path);
        return [
            'background' => $this->color($value['background'] ?? '#f4f5f7', "$path.background"),
            'gridSize' => $this->integer($value['gridSize'] ?? 8, "$path.gridSize", 1, 100),
            'snapToGrid' => $this->boolean($value['snapToGrid'] ?? true, "$path.snapToGrid"),
        ];
    }

    private function section(mixed $value, string $path): array
    {
        $value = $this->object($value, $path);
        $style = $this->object($value['style'] ?? [], "$path.style");

        $elements = [];
        foreach ($this->list($value['elements'] ?? [], "$path.elements", self::MAX_ELEMENTS_PER_SECTION) as $i => $element) {
            $elements[] = $this->element($element, "$path.elements[$i]");
        }

        return [
            'id' => $this->id($value['id'] ?? null, "$path.id"),
            ...$this->box($value, $path),
            'style' => $this->style($style, "$path.style", self::sectionLegacy($style)),
            'elements' => $elements,
        ];
    }

    private function element(mixed $value, string $path): array
    {
        $value = $this->object($value, $path);
        $type = $value['type'] ?? null;
        $content = $this->object($value['content'] ?? [], "$path.content");

        $legacy = ['fill' => ['type' => 'none'], 'radius' => 0, 'border' => ['width' => 0, 'color' => '#e3e6eb']];
        if ($type === 'image' && is_int($content['borderRadius'] ?? null)) {
            $legacy['radius'] = min(max($content['borderRadius'], 0), self::MAX_RADIUS);
        }

        return [
            'id' => $this->id($value['id'] ?? null, "$path.id"),
            'type' => $type,
            ...$this->box($value, $path),
            'style' => $this->style($this->object($value['style'] ?? [], "$path.style"), "$path.style", $legacy),
            'content' => match ($type) {
                'text' => $this->textContent($content, "$path.content"),
                'image' => $this->imageContent($content, "$path.content"),
                'chart' => $this->chartContent($content, "$path.content"),
                default => $this->fail("$path.type", 'must be one of: text, image, chart', []),
            },
        ];
    }

    private function box(array $value, string $path): array
    {
        return [
            'x' => $this->number($value['x'] ?? null, "$path.x", 0, self::MAX_COORD),
            'y' => $this->number($value['y'] ?? null, "$path.y", 0, self::MAX_COORD),
            'width' => $this->number($value['width'] ?? null, "$path.width", self::MIN_SIZE, self::MAX_COORD),
            'height' => $this->number($value['height'] ?? null, "$path.height", self::MIN_SIZE, self::MAX_COORD),
            'zIndex' => $this->integer($value['zIndex'] ?? 0, "$path.zIndex", 0, 10000),
        ];
    }

    private function style(array $style, string $path, array $defaults): array
    {
        $fill = $this->object($style['fill'] ?? $defaults['fill'], "$path.fill");
        $border = $this->object($style['border'] ?? $defaults['border'], "$path.border");
        return [
            'fill' => $this->fill($fill, "$path.fill"),
            'opacity' => $this->integer($style['opacity'] ?? 100, "$path.opacity", 0, 100),
            'radius' => $this->integer($style['radius'] ?? $defaults['radius'], "$path.radius", 0, self::MAX_RADIUS),
            'border' => [
                'width' => $this->integer($border['width'] ?? 0, "$path.border.width", 0, 16),
                'color' => $this->color($border['color'] ?? '#e3e6eb', "$path.border.color"),
            ],
            'shadow' => $this->choice($style['shadow'] ?? 'none', "$path.shadow", self::SHADOWS),
        ];
    }

    private function fill(array $fill, string $path): array
    {
        $type = $this->choice($fill['type'] ?? 'none', "$path.type", ['none', 'solid', 'linear']);
        return match ($type) {
            'none' => ['type' => 'none'],
            'solid' => ['type' => 'solid', 'color' => $this->color($fill['color'] ?? '#ffffff', "$path.color")],
            'linear' => [
                'type' => 'linear',
                'from' => $this->color($fill['from'] ?? '#ffffff', "$path.from"),
                'to' => $this->color($fill['to'] ?? '#ffffff', "$path.to"),
                'angle' => $this->integer($fill['angle'] ?? 135, "$path.angle", 0, 360),
            ],
        };
    }

    private static function sectionLegacy(array $style): array
    {
        $borderColor = $style['borderColor'] ?? 'transparent';
        $hasBorder = is_string($borderColor) && $borderColor !== 'transparent';
        return [
            'fill' => ['type' => 'solid', 'color' => $style['background'] ?? '#ffffff'],
            'radius' => is_int($style['borderRadius'] ?? null) ? min(max($style['borderRadius'], 0), self::MAX_RADIUS) : 8,
            'border' => ['width' => $hasBorder ? 1 : 0, 'color' => $hasBorder ? $borderColor : '#e3e6eb'],
        ];
    }

    private function textContent(array $content, string $path): array
    {
        $html = $this->string($content['html'] ?? '', "$path.html", 0, self::MAX_TEXT_HTML);
        return ['html' => $this->sanitizer->clean($html)];
    }

    private function imageContent(array $content, string $path): array
    {
        $src = $this->string($content['src'] ?? '', "$path.src", 0, 255);
        if ($src !== '' && !preg_match(self::IMAGE_SRC, $src)) {
            $src = $this->fail("$path.src", 'must be a path returned by the upload API', '');
        }
        return [
            'src' => $src,
            'fit' => $this->choice($content['fit'] ?? 'cover', "$path.fit", ['cover', 'contain', 'fill']),
            'alt' => $this->string($content['alt'] ?? '', "$path.alt", 0, 200),
        ];
    }

    private function chartContent(array $content, string $path): array
    {
        $chart = [
            'chartType' => $this->choice($content['chartType'] ?? 'bar', "$path.chartType", ['bar', 'line']),
            'title' => $this->string($content['title'] ?? '', "$path.title", 0, 120),
            'dataSource' => $this->choice($content['dataSource'] ?? 'static', "$path.dataSource", ['static', 'api']),
            'showLegend' => $this->boolean($content['showLegend'] ?? true, "$path.showLegend"),
            'labels' => [],
            'datasets' => [],
        ];
        foreach ($this->list($content['labels'] ?? [], "$path.labels", 60) as $i => $label) {
            $chart['labels'][] = $this->string($label, "$path.labels[$i]", 0, 40);
        }
        foreach ($this->list($content['datasets'] ?? [], "$path.datasets", 5) as $i => $dataset) {
            $chart['datasets'][] = $this->dataset($dataset, "$path.datasets[$i]");
        }

        if ($chart['dataSource'] === 'static' && $chart['datasets'] === []) {
            $this->fail("$path.datasets", 'needs at least one dataset for a static chart', null);
        }
        if ($chart['dataSource'] === 'api') {
            $refresh = $this->integer($content['refreshSec'] ?? 0, "$path.refreshSec", 0, 3600);
            if ($refresh === 1) {
                $refresh = $this->fail("$path.refreshSec", 'must be 0 (off) or at least 2 seconds', 0);
            }
            $chart += [
                'metric' => $this->choice($content['metric'] ?? null, "$path.metric", array_keys(Metrics::DEFINITIONS)),
                'granularity' => $this->choice($content['granularity'] ?? 'month', "$path.granularity", Metrics::GRANULARITIES),
                'points' => $this->integer($content['points'] ?? 12, "$path.points", 3, 60),
                'refreshSec' => $refresh,
            ];
        }
        return $chart;
    }

    private function dataset(mixed $value, string $path): array
    {
        $value = $this->object($value, $path);
        $data = [];
        foreach ($this->list($value['data'] ?? [], "$path.data", 60) as $i => $point) {
            if ((is_int($point) || is_float($point)) && is_finite((float) $point)) {
                $data[] = $point;
            } else {
                $this->fail("$path.data[$i]", 'must be a number', null);
            }
        }
        $color = $value['color'] ?? '';
        return [
            'label' => $this->string($value['label'] ?? '', "$path.label", 0, 60),
            'data' => $data,
            'color' => $color === '' ? '' : $this->color($color, "$path.color"),
        ];
    }

    private function id(mixed $value, string $path): string
    {
        if (!Uuid::isValid($value)) {
            return $this->fail($path, 'must be a UUID', '');
        }
        $value = strtolower($value);
        if (isset($this->seenIds[$value])) {
            return $this->fail($path, 'is used by more than one section or element', $value);
        }
        $this->seenIds[$value] = true;
        return $value;
    }

    private function string(mixed $value, string $path, int $min, int $max): string
    {
        if (!is_string($value)) {
            return $this->fail($path, 'must be a string', '');
        }
        $value = trim($value);
        $length = mb_strlen($value);
        if ($length < $min || $length > $max) {
            return $this->fail($path, $min > 0 ? "must be $min to $max characters" : "must be at most $max characters", '');
        }
        return $value;
    }

    private function integer(mixed $value, string $path, int $min, int $max): int
    {
        if (is_float($value) && is_finite($value) && floor($value) === $value) {
            $value = (int) $value;
        }
        if (!is_int($value) || $value < $min || $value > $max) {
            return $this->fail($path, "must be a whole number from $min to $max", $min);
        }
        return $value;
    }

    private function number(mixed $value, string $path, int $min, int $max): int
    {
        if (!(is_int($value) || is_float($value)) || !is_finite((float) $value) || $value < $min || $value > $max) {
            return $this->fail($path, "must be a number from $min to $max", $min);
        }
        return (int) round($value);
    }

    private function boolean(mixed $value, string $path): bool
    {
        return is_bool($value) ? $value : $this->fail($path, 'must be true or false', false);
    }

    private function choice(mixed $value, string $path, array $options): string
    {
        return in_array($value, $options, true)
            ? $value
            : $this->fail($path, 'must be one of: ' . implode(', ', $options), $options[0]);
    }

    private function color(mixed $value, string $path): string
    {
        return is_string($value) && preg_match(self::COLOR, $value)
            ? $value
            : $this->fail($path, 'must be a hex, rgb() or rgba() color', 'transparent');
    }

    private function object(mixed $value, string $path): array
    {
        if (!is_array($value) || ($value !== [] && array_is_list($value))) {
            return $this->fail($path, 'must be an object', []);
        }
        return $value;
    }

    private function list(mixed $value, string $path, int $max): array
    {
        if (!is_array($value) || !array_is_list($value)) {
            return $this->fail($path, 'must be an array', []);
        }
        if (count($value) > $max) {
            return $this->fail($path, "can have at most $max items", []);
        }
        return $value;
    }

    private function fail(string $path, string $message, mixed $fallback): mixed
    {
        if (count($this->errors) < self::MAX_ERRORS) {
            $this->errors[] = ['field' => $path, 'message' => $message];
        }
        return $fallback;
    }

    private function reset(): void
    {
        $this->errors = [];
        $this->seenIds = [];
    }

    private function throwIfInvalid(): void
    {
        if ($this->errors !== []) {
            throw new HttpException(422, 'Some fields are invalid.', ['errors' => $this->errors]);
        }
    }
}
