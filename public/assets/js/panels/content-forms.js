/** Properties for each element type's content: text, image and chart. */

import { api } from '../api.js';
import { SERIES } from '../elements/chart.js';
import { findItem } from '../store.js';
import { h, icon } from '../utils.js';
import { field, group, row } from './fields.js';

const MAX_ROWS = 60;
const MAX_SERIES = 5;

const FALLBACK_METRICS = [
  { key: 'revenue', label: 'Revenue' },
  { key: 'users', label: 'Active users' },
  { key: 'orders', label: 'Orders' },
  { key: 'conversion', label: 'Conversion rate' },
];
let metrics = null;

/** Changes to these rebuild the form (they add or remove inputs). */
export function structureKey(item) {
  if (item.type === 'chart') {
    const c = item.content;
    return `${c.dataSource}:${c.labels.length}:${c.datasets.length}`;
  }
  if (item.type === 'image') return item.content.src ? 'image' : 'empty';
  return '';
}

export function contentForm(kit, store, element, actions) {
  const id = element.id;
  const content = (state) => findItem(state.dashboard, id)?.item.content ?? {};
  const set = (changes, coalesce = null) =>
    store.dispatch({ type: 'item/update', id, changes: { content: changes }, coalesce });
  const ctx = { kit, store, id, element, content, set, actions };

  if (element.type === 'text') return textForm(ctx);
  if (element.type === 'image') return imageForm(ctx);
  if (element.type === 'chart') return chartForm(ctx);
  return [];
}

// ---- Text ------------------------------------------------------------------------

function textForm({ id, actions }) {
  return [
    group('Text',
      h('p', { class: 'props-hint' },
        'Double-click the text on the canvas to type. The toolbar above it sets bold, italic, underline, size and colour, for the selected words or the whole box.'),
      h('button', { class: 'btn', type: 'button', onClick: () => actions.editText(id) }, icon('edit'), 'Edit text')),
  ];
}

// ---- Image ------------------------------------------------------------------------

function imageForm({ kit, id, element, content, set, actions }) {
  const hasImage = Boolean(element.content.src);
  return [
    group('Image',
      hasImage
        ? h('div', { class: 'button-row' },
          h('button', { class: 'btn', type: 'button', onClick: () => actions.pickImage(id) }, icon('image'), 'Replace'),
          h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => set({ src: '' }) }, 'Remove'))
        : h('div', {},
          h('button', { class: 'btn btn-primary', type: 'button', onClick: () => actions.pickImage(id) }, icon('image'), 'Upload image'),
          h('p', { class: 'props-hint' }, 'PNG, JPEG, GIF or WebP, up to 5 MB. You can also drop an image file onto the canvas.')),
      field('Fit', kit.segmented(
        [{ value: 'cover', label: 'Fill' }, { value: 'contain', label: 'Fit' }, { value: 'fill', label: 'Stretch' }],
        (s) => content(s).fit, (fit) => set({ fit }), 'Image fit')),
      field('Alt text', kit.text((s) => content(s).alt, (alt) => set({ alt }, `${id}:alt`),
        { placeholder: 'Describe the image', maxLength: 200 }))),
  ];
}

// ---- Chart ------------------------------------------------------------------------

function chartForm(ctx) {
  const { kit, id, element, content, set } = ctx;
  const isApi = element.content.dataSource === 'api';

  return [
    group('Chart',
      field('Type', kit.segmented(
        [{ value: 'bar', label: 'Bar' }, { value: 'line', label: 'Line' }],
        (s) => content(s).chartType, (chartType) => set({ chartType }), 'Chart type')),
      field('Title', kit.text((s) => content(s).title, (title) => set({ title }, `${id}:title`), { maxLength: 120 })),
      kit.checkbox('Show legend (2+ series)', (s) => content(s).showLegend, (showLegend) => set({ showLegend }))),
    group('Data',
      kit.segmented(
        [{ value: 'static', label: 'My data' }, { value: 'api', label: 'Generated' }],
        (s) => content(s).dataSource, (source) => switchSource(ctx, source), 'Data source'),
      ...(isApi ? apiFields(ctx) : staticFields(ctx))),
  ];
}

function switchSource({ store, content, set }, source) {
  const c = content(store.getState());
  if (c.dataSource === source) return;
  if (source === 'api') {
    set({ dataSource: 'api', metric: c.metric ?? 'revenue', granularity: c.granularity ?? 'month', points: c.points ?? 12, refreshSec: c.refreshSec ?? 0 });
  } else {
    // Static charts need at least one series; start from a small sample.
    set(c.datasets.length
      ? { dataSource: 'static' }
      : { dataSource: 'static', labels: ['A', 'B', 'C', 'D'], datasets: [{ label: 'Series 1', data: [4, 7, 5, 9], color: '' }] });
  }
}

function apiFields({ kit, store, id, content, set }) {
  const metric = kit.select(FALLBACK_METRICS.map((m) => ({ value: m.key, label: m.label })),
    (s) => content(s).metric, (value) => set({ metric: value }));
  // Swap in the server's list once it arrives.
  metrics ??= api.chartMetrics().then((r) => r.metrics).catch(() => FALLBACK_METRICS);
  metrics.then((list) => {
    const current = metric.value;
    metric.replaceChildren(...list.map((m) => h('option', { value: m.key }, m.label)));
    metric.value = current;
  });

  return [
    h('p', { class: 'props-hint' }, 'Numbers are generated by the server at /api/chart-data.'),
    field('Metric', metric),
    field('Period', kit.select(
      [{ value: 'month', label: 'Monthly' }, { value: 'day', label: 'Daily' }, { value: 'live', label: 'Live (every 5 seconds)' }],
      (s) => content(s).granularity,
      // Live data is only interesting if it refreshes, so switch refresh on with it.
      (granularity) => set(granularity === 'live' && !content(store.getState()).refreshSec
        ? { granularity, refreshSec: 5 } : { granularity }))),
    row('Points', kit.number((s) => content(s).points, (points) => set({ points: Math.max(3, points) }, `${id}:points`),
      { min: 3, max: 60 })),
    field('Auto-refresh', kit.select(
      [0, 2, 5, 10, 30, 60].map((sec) => ({ value: String(sec), label: sec ? `Every ${sec} seconds` : 'Off' })),
      (s) => content(s).refreshSec, (value) => set({ refreshSec: Number(value) }))),
  ];
}

function staticFields(ctx) {
  const { kit, store, id, element, content, set } = ctx;
  const { labels, datasets } = element.content;
  const now = () => content(store.getState());

  const update = (fn, coalesce = null) => set(fn(now()), coalesce);
  const setLabel = (r, value) => update((c) => ({ labels: c.labels.map((l, i) => (i === r ? value : l)) }), `${id}:label:${r}`);
  const setValue = (d, r, value) => update((c) => ({
    datasets: c.datasets.map((ds, i) => (i !== d ? ds : { ...ds, data: c.labels.map((_, k) => (k === r ? value : ds.data[k] ?? 0)) })),
  }), `${id}:value:${d}:${r}`);
  const setSeries = (d, changes, key) => update((c) => ({
    datasets: c.datasets.map((ds, i) => (i === d ? { ...ds, ...changes } : ds)),
  }), key);

  const addRow = () => update((c) => ({
    labels: [...c.labels, `Item ${c.labels.length + 1}`],
    datasets: c.datasets.map((ds) => ({ ...ds, data: [...c.labels.map((_, k) => ds.data[k] ?? 0), 0] })),
  }));
  const removeRow = (r) => update((c) => ({
    labels: c.labels.filter((_, i) => i !== r),
    datasets: c.datasets.map((ds) => ({ ...ds, data: ds.data.filter((_, i) => i !== r) })),
  }));
  const addSeries = () => update((c) => ({
    datasets: [...c.datasets, { label: `Series ${c.datasets.length + 1}`, data: c.labels.map(() => 0), color: '' }],
  }));
  const removeSeries = (d) => update((c) => ({ datasets: c.datasets.filter((_, i) => i !== d) }));

  const removeButton = (label, onClick, disabled = false) =>
    h('button', { class: 'btn btn-ghost btn-icon btn-small', type: 'button', 'aria-label': label, title: label, disabled, onClick }, icon('close'));

  const series = datasets.map((_, d) => h('div', { class: 'series-row' },
    kit.color((s) => now().datasets?.[d]?.color || SERIES[d], (color) => setSeries(d, { color }, `${id}:color:${d}`)),
    kit.text((s) => content(s).datasets?.[d]?.label, (label) => setSeries(d, { label }, `${id}:series:${d}`), { maxLength: 60 }),
    removeButton(`Remove series ${d + 1}`, () => removeSeries(d), datasets.length === 1)));

  const table = h('table', { class: 'data-table' },
    h('thead', {}, h('tr', {},
      h('th', {}, 'Label'),
      datasets.map((_, d) => h('th', {}, h('span', { class: 'swatch', style: { background: datasets[d].color || SERIES[d] } }), `${d + 1}`)),
      h('th', { 'aria-label': 'Remove row' }))),
    h('tbody', {}, labels.map((_, r) => h('tr', {},
      h('td', {}, kit.text((s) => content(s).labels?.[r], (value) => setLabel(r, value), { maxLength: 40 })),
      datasets.map((_, d) => h('td', {}, kit.number((s) => content(s).datasets?.[d]?.data[r] ?? 0, (value) => setValue(d, r, value), { integer: false }))),
      h('td', {}, removeButton(`Remove row ${r + 1}`, () => removeRow(r), labels.length === 1))))));

  return [
    h('div', { class: 'field-label' }, 'Series'),
    ...series,
    h('button', { class: 'btn btn-small', type: 'button', disabled: datasets.length >= MAX_SERIES, onClick: addSeries }, icon('plus'), 'Add series'),
    h('div', { class: 'field-label table-label' }, 'Values'),
    h('div', { class: 'data-table-wrap' }, table),
    h('button', { class: 'btn btn-small', type: 'button', disabled: labels.length >= MAX_ROWS, onClick: addRow }, icon('plus'), 'Add row'),
  ];
}
