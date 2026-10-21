/**
 * Bar and line charts drawn with Chart.js (loaded globally as `Chart`).
 *
 * `dataSource: "static"` draws the labels/datasets stored in the element.
 * `dataSource: "api"` fetches /api/chart-data and, if refreshSec > 0, keeps
 * fetching so the chart updates live.
 */

import { api } from '../api.js';
import { formatValue, h } from '../utils.js';

// Categorical series colors in fixed order (validated light palette).
export const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
const INK = {
  primary: '#0b0b0b',
  secondary: '#52514e',
  muted: '#898781',
  grid: '#e1e0d9',
  axis: '#c3c2b7',
};

const liveTime = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });

/** Per-chart runtime state, keyed by the element's body node. */
const states = new WeakMap();
let defaultsApplied = false;

export const chart = {
  label: 'Chart',

  name: (el) => el.content.title || 'Chart',

  defaults(variant = 'bar') {
    if (variant === 'live') {
      return {
        width: 480,
        height: 280,
        content: {
          chartType: 'line', title: 'Revenue (live)', dataSource: 'api', showLegend: false,
          labels: [], datasets: [], metric: 'revenue', granularity: 'live', points: 20, refreshSec: 5,
        },
      };
    }
    if (variant === 'line') {
      return {
        width: 480,
        height: 280,
        content: {
          chartType: 'line', title: 'Active users', dataSource: 'api', showLegend: false,
          labels: [], datasets: [], metric: 'users', granularity: 'day', points: 14, refreshSec: 0,
        },
      };
    }
    return {
      width: 400,
      height: 280,
      content: {
        chartType: 'bar', title: 'Tickets this week', dataSource: 'static', showLegend: true,
        labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
        datasets: [{ label: 'Tickets', data: [12, 19, 9, 15, 22], color: '' }],
      },
    };
  },

  create(el) {
    applyChartDefaults();
    const canvas = h('canvas', { role: 'img' });
    const status = h('div', { class: 'chart-status', hidden: true });
    const body = h('div', { class: 'element-body chart-body' }, h('div', { class: 'chart-canvas-wrap' }, canvas), status);
    const state = { canvas, status, chart: null, timer: null, requestKey: null, live: null, content: null, destroyed: false };
    states.set(body, state);
    apply(state, el.content);
    return body;
  },

  update(body, el, prev) {
    if (el.content !== prev.content) apply(states.get(body), el.content);
  },

  destroy(body) {
    const state = states.get(body);
    state.destroyed = true;
    stopPolling(state);
    state.chart?.destroy();
  },
};

function applyChartDefaults() {
  if (defaultsApplied) return;
  defaultsApplied = true;
  Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
  Chart.defaults.color = INK.muted;
}

function apply(state, content) {
  state.content = content;
  state.canvas.setAttribute('aria-label', content.title || `${content.chartType} chart`);

  if (content.dataSource === 'api') {
    const key = [content.metric, content.granularity, content.points, content.refreshSec].join('|');
    if (key !== state.requestKey) {
      // Keep showing the previous data until the new response arrives, so the chart doesn't blank.
      state.requestKey = key;
      startPolling(state);
    }
  } else {
    stopPolling(state);
    state.requestKey = null;
    state.live = null;
    setStatus(state, content.datasets.length ? '' : 'No data yet');
  }
  draw(state);
}

function draw(state) {
  if (state.destroyed) return;
  const content = state.content;
  const data = content.dataSource === 'api'
    ? state.live ?? { labels: [], datasets: [], unit: '' }
    : { labels: content.labels, datasets: content.datasets, unit: '' };
  const config = buildConfig(content, data);

  if (state.chart && state.chart.config.type !== content.chartType) {
    state.chart.destroy();
    state.chart = null;
  }
  if (!state.chart) {
    state.chart = new Chart(state.canvas, config);
    return;
  }
  state.chart.data = config.data;
  state.chart.options = config.options;
  state.chart.update();
}

// ---- Live data ---------------------------------------------------------------

function startPolling(state) {
  stopPolling(state);
  const { metric, granularity, points, refreshSec } = state.content;
  const key = state.requestKey;
  let first = true;

  const load = async () => {
    // Don't poll while the tab is in the background (but always load once).
    if (!first && document.hidden) return;
    if (first) setStatus(state, 'Loading…');
    first = false;
    try {
      const res = await api.chartData({ metric, granularity, points });
      if (state.destroyed || state.requestKey !== key) return;
      const labels = granularity === 'live'
        ? res.timestamps.map((t) => liveTime.format(new Date(t * 1000)))
        : res.labels;
      state.live = { labels, datasets: res.datasets, unit: res.unit };
      setStatus(state, refreshSec > 0 ? 'Live' : '');
      draw(state);
    } catch {
      if (!state.destroyed && state.requestKey === key) setStatus(state, 'Couldn’t load data', true);
    }
  };

  load();
  if (refreshSec > 0) state.timer = setInterval(load, refreshSec * 1000);
}

function stopPolling(state) {
  clearInterval(state.timer);
  state.timer = null;
}

function setStatus(state, text, isError = false) {
  state.status.textContent = text;
  state.status.hidden = !text;
  state.status.classList.toggle('is-error', isError);
}

// ---- Chart.js config -----------------------------------------------------------

function buildConfig(content, data) {
  const type = content.chartType;
  const count = data.datasets.length;
  const unit = data.unit;

  const datasets = data.datasets.map((ds, i) => {
    const color = ds.color || SERIES[i % SERIES.length];
    const base = { label: ds.label || `Series ${i + 1}`, data: ds.data };
    if (type === 'bar') {
      return {
        ...base,
        backgroundColor: color,
        hoverBackgroundColor: color,
        borderRadius: { topLeft: 4, topRight: 4 },
        borderSkipped: 'start',
        maxBarThickness: 24,
        barPercentage: count > 1 ? 0.9 : 0.6,
        categoryPercentage: 0.7,
      };
    }
    return {
      ...base,
      borderColor: color,
      backgroundColor: withAlpha(color, 0.1),
      fill: count === 1 ? 'origin' : false,
      borderWidth: 2,
      borderCapStyle: 'round',
      borderJoinStyle: 'round',
      tension: 0.25,
      pointRadius: 0,
      pointHoverRadius: 5,
      pointHitRadius: 12,
      pointBackgroundColor: color,
      pointBorderColor: '#ffffff',
      pointHoverBorderWidth: 2,
    };
  });

  return {
    type,
    data: { labels: data.labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 300 },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        title: {
          display: Boolean(content.title),
          text: content.title,
          align: 'start',
          color: INK.primary,
          font: { size: 14, weight: '600' },
          padding: { top: 2, bottom: 12 },
        },
        // A single series is named by the title; a legend box would repeat it.
        legend: {
          display: content.showLegend && count >= 2,
          position: 'top',
          align: 'end',
          labels: {
            color: INK.secondary,
            usePointStyle: true,
            pointStyle: type === 'line' ? 'line' : 'rectRounded',
            boxWidth: 10,
            boxHeight: 10,
          },
        },
        tooltip: {
          backgroundColor: '#ffffff',
          titleColor: INK.primary,
          bodyColor: INK.secondary,
          borderColor: 'rgba(11, 11, 11, 0.10)',
          borderWidth: 1,
          padding: 10,
          usePointStyle: true,
          boxPadding: 4,
          callbacks: {
            label: (ctx) => ` ${ctx.dataset.label}: ${formatValue(ctx.parsed.y, unit)}`,
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          border: { color: INK.axis },
          ticks: { color: INK.muted, maxRotation: 0, autoSkip: true, autoSkipPadding: 12 },
        },
        y: {
          beginAtZero: type === 'bar', // bars must grow from zero; lines may zoom in
          grid: { color: INK.grid },
          border: { display: false },
          ticks: { color: INK.muted, maxTicksLimit: 5, callback: (v) => formatValue(v, unit, { short: true }) },
        },
      },
    },
  };
}

function withAlpha(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
