<?php

declare(strict_types=1);

namespace App\Controllers;

use App\HttpException;
use App\Request;
use App\Response;
use App\Support\Metrics;

final class ChartDataController
{
    /** GET /api/chart-data/metrics — the metrics a chart can pick from */
    public function metrics(): void
    {
        $metrics = [];
        foreach (Metrics::DEFINITIONS as $key => $def) {
            $metrics[] = ['key' => $key, 'label' => $def['label'], 'unit' => $def['unit']];
        }
        Response::json(['data' => [
            'metrics' => $metrics,
            'granularities' => Metrics::GRANULARITIES,
        ]]);
    }

    /** GET /api/chart-data?metric=revenue&granularity=month|day|live&points=12 */
    public function show(): void
    {
        $metric = Request::query('metric') ?? '';
        if (!isset(Metrics::DEFINITIONS[$metric])) {
            throw new HttpException(422, 'Unknown metric.', ['allowed' => array_keys(Metrics::DEFINITIONS)]);
        }

        $granularity = Request::query('granularity') ?? 'month';
        if (!in_array($granularity, Metrics::GRANULARITIES, true)) {
            throw new HttpException(422, 'Unknown granularity.', ['allowed' => Metrics::GRANULARITIES]);
        }

        $points = filter_var(Request::query('points') ?? '12', FILTER_VALIDATE_INT, [
            'options' => ['min_range' => 3, 'max_range' => 60],
        ]);
        if ($points === false) {
            throw new HttpException(422, 'points must be a whole number from 3 to 60.');
        }

        $def = Metrics::DEFINITIONS[$metric];
        $series = Metrics::series($metric, $granularity, $points);

        Response::json(['data' => [
            'metric' => $metric,
            'label' => $def['label'],
            'unit' => $def['unit'],
            'granularity' => $granularity,
            'labels' => $series['labels'],
            // Unix seconds, so the browser can format labels in local time.
            'timestamps' => $series['timestamps'],
            'datasets' => [['label' => $def['label'], 'data' => $series['values']]],
            'generatedAt' => gmdate('Y-m-d\TH:i:s\Z'),
        ]]);
    }
}
