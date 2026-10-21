<?php

declare(strict_types=1);

namespace App\Support;

final class Metrics
{
    public const DEFINITIONS = [
        'revenue'    => ['label' => 'Revenue',         'unit' => 'USD', 'base' => 48000, 'trend' => 0.035, 'noise' => 0.08, 'decimals' => 0],
        'users'      => ['label' => 'Active users',    'unit' => '',    'base' => 1800,  'trend' => 0.05,  'noise' => 0.06, 'decimals' => 0],
        'orders'     => ['label' => 'Orders',          'unit' => '',    'base' => 620,   'trend' => 0.02,  'noise' => 0.12, 'decimals' => 0],
        'conversion' => ['label' => 'Conversion rate', 'unit' => '%',   'base' => 3.4,   'trend' => 0.01,  'noise' => 0.05, 'decimals' => 2],
    ];

    public const GRANULARITIES = ['month', 'day', 'live'];

    private const LIVE_STEP_SECONDS = 5;

    public static function series(string $metric, string $granularity, int $points, ?int $now = null): array
    {
        $def = self::DEFINITIONS[$metric];
        $now ??= time();
        $today = (new \DateTimeImmutable('@' . $now))
            ->setTimezone(new \DateTimeZone(date_default_timezone_get()))
            ->setTime(0, 0);
        $epoch = new \DateTimeImmutable('2024-01-01', $today->getTimezone());

        $labels = [];
        $timestamps = [];
        $values = [];
        for ($back = $points - 1; $back >= 0; $back--) {
            switch ($granularity) {
                case 'month':
                    $date = $today->modify('first day of this month')->modify("-$back months");
                    $month = (int) $date->format('n');
                    $step = ((int) $date->format('Y') - 2024) * 12 + $month - 1;
                    $shape = (1 + $def['trend']) ** $step * (1 + 0.08 * sin(2 * M_PI * $month / 12));
                    $label = $date->format('M Y');
                    $time = $date->getTimestamp();
                    break;
                case 'day':
                    $date = $today->modify("-$back days");
                    $step = (int) $epoch->diff($date)->days;
                    $shape = (1 + $def['trend'] / 30) ** $step * (1 + 0.06 * sin(2 * M_PI * (int) $date->format('N') / 7));
                    $label = $date->format('M j');
                    $time = $date->getTimestamp();
                    break;
                default:
                    $step = intdiv($now, self::LIVE_STEP_SECONDS) - $back;
                    $shape = 1 + 0.12 * sin($step / 5) + 0.06 * sin($step / 13);
                    $time = $step * self::LIVE_STEP_SECONDS;
                    $label = date('H:i:s', $time);
            }

            $value = round($def['base'] * $shape * (1 + $def['noise'] * self::noise("$metric:$granularity:$step")), $def['decimals']);
            $labels[] = $label;
            $timestamps[] = $time;
            $values[] = $def['decimals'] === 0 ? (int) $value : $value;
        }

        return ['labels' => $labels, 'timestamps' => $timestamps, 'values' => $values];
    }

    private static function noise(string $key): float
    {
        return crc32($key) / 0xFFFFFFFF * 2 - 1;
    }
}
