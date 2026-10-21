/**
 * Left "Add" panel: element tiles and ready-made layouts. Click a tile to add
 * it to the selected section, or drag it onto the canvas to place it.
 */

import { registry } from '../elements/index.js';
import { sectionAt } from '../interactions.js';
import { findItem } from '../store.js';
import { DEFAULT_SECTION_STYLE } from '../styles.js';
import { clamp, h, icon, loadPref, savePref, uuid } from '../utils.js';

const DRAG_TYPE = 'application/x-dashboard-tool';
const SECTION_GAP = 24;
const INSET = 16;

/** Element tiles, by category. `make()` returns the new element's type, size and content. */
const CATEGORIES = [
  { name: 'Structure', tools: [
    { id: 'section', name: 'Section', icon: 'section' },
  ] },
  { name: 'Typography', tools: [
    { id: 'heading', name: 'Heading', icon: 'heading', make: () => ({ type: 'text', ...registry.text.defaults('heading') }) },
    { id: 'paragraph', name: 'Paragraph', icon: 'paragraph', make: () => ({ type: 'text', ...registry.text.defaults('paragraph') }) },
    { id: 'textblock', name: 'Text block', icon: 'text', make: () => ({ type: 'text', ...registry.text.defaults('block') }) },
  ] },
  { name: 'Media', tools: [
    { id: 'image', name: 'Image', icon: 'image', make: () => ({ type: 'image', ...registry.image.defaults() }) },
  ] },
  { name: 'Charts', tools: [
    { id: 'bar', name: 'Bar chart', icon: 'bar', make: () => ({ type: 'chart', ...registry.chart.defaults('bar') }) },
    { id: 'line', name: 'Line chart', icon: 'line', make: () => ({ type: 'chart', ...registry.chart.defaults('line') }) },
    { id: 'live', name: 'Live chart', icon: 'live', make: () => ({ type: 'chart', ...registry.chart.defaults('live') }) },
  ] },
];
const TOOLS = new Map(CATEGORIES.flatMap((c) => c.tools).map((t) => [t.id, t]));

// ---- Layouts: whole sections with elements already arranged ----------------------

const text = (x, y, width, height, html) => ({ type: 'text', x, y, width, height, content: { html } });
const chartOf = (variant, x, y, width, height) => ({ type: 'chart', x, y, width, height, content: registry.chart.defaults(variant).content });
const stat = (label, value, change) =>
  `<p style="color: #52514e">${label}</p><h2 style="font-size: 32px">${value}</h2><p style="color: #0f7b3f">▲ ${change} vs last month</p>`;

const LAYOUTS = [
  {
    id: 'header', name: 'Header', hint: 'Logo and title',
    build: (w) => ({ height: 120, elements: [
      { type: 'image', x: 24, y: 24, width: 72, height: 72, content: { ...registry.image.defaults().content, src: 'assets/img/sample-logo.svg', fit: 'contain', alt: 'Logo' } },
      text(112, 20, w - 136, 80, '<h1 style="font-size: 28px">Dashboard title</h1><p>A short line about what this dashboard shows.</p>'),
    ] }),
    preview: '<rect x="4" y="10" width="10" height="10" rx="2"/><rect x="18" y="11" width="30" height="4" rx="1"/><rect x="18" y="17" width="20" height="2" rx="1"/>',
  },
  {
    id: 'kpis', name: 'KPI row', hint: 'Three headline numbers',
    build: (w) => {
      const tile = (w - 24 * 4) / 3;
      return { height: 136, elements: [
        text(24, 20, tile, 96, stat('Revenue', '$48.2K', '4.1%')),
        text(48 + tile, 20, tile, 96, stat('Active users', '1,824', '6.3%')),
        text(72 + tile * 2, 20, tile, 96, stat('Orders', '612', '2.0%')),
      ] };
    },
    preview: '<rect x="4" y="9" width="12" height="12" rx="1.5"/><rect x="20" y="9" width="12" height="12" rx="1.5"/><rect x="36" y="9" width="12" height="12" rx="1.5"/>',
  },
  {
    id: 'charts', name: 'Two charts', hint: 'Bar and line side by side',
    build: (w) => {
      const half = (w - 24 * 3) / 2;
      return { height: 320, elements: [chartOf('bar', 24, 20, half, 280), chartOf('line', 48 + half, 20, half, 280)] };
    },
    preview: '<path d="M6 22V14M10 22V10M14 22V16M18 22V12"/><path d="m28 20 5-6 4 3 7-8"/>',
  },
  {
    id: 'text-image', name: 'Text and image', hint: 'Copy beside a picture',
    build: (w) => {
      const half = (w - 24 * 3) / 2;
      return { height: 240, elements: [
        text(24, 24, half, 192, '<h2 style="font-size: 24px">Section title</h2><p>Explain what the numbers mean, or call out what changed this month.</p>'),
        { type: 'image', x: 48 + half, y: 24, width: half, height: 192, content: registry.image.defaults().content },
      ] };
    },
    preview: '<rect x="4" y="9" width="18" height="3" rx="1"/><rect x="4" y="15" width="16" height="2" rx="1"/><rect x="4" y="19" width="12" height="2" rx="1"/><rect x="28" y="8" width="20" height="14" rx="1.5"/>',
  },
];
const LAYOUT_MAP = new Map(LAYOUTS.map((l) => [l.id, l]));

export function createToolbox(root, store, canvas, viewport) {
  let tab = loadPref('addTab', 'elements');
  const collapsed = new Set(loadPref('collapsedCategories', []));

  const tabs = h('div', { class: 'tabs', role: 'tablist' });
  const body = h('div', { class: 'add-body' });
  root.append(h('div', { class: 'panel-head' }, h('h2', {}, 'Add')), tabs, body);

  function render() {
    tabs.replaceChildren(...[['elements', 'Elements'], ['layouts', 'Layouts']].map(([id, label]) =>
      h('button', {
        class: 'tab', type: 'button', role: 'tab', 'aria-selected': String(tab === id),
        onClick: () => { tab = id; savePref('addTab', tab); render(); },
      }, label)));
    body.replaceChildren(...(tab === 'elements' ? elementTiles() : layoutCards()));
    syncDisabled(store.getState());
  }

  function elementTiles() {
    return CATEGORIES.map((category) => {
      const open = !collapsed.has(category.name);
      return h('section', { class: `category${open ? '' : ' is-collapsed'}` },
        h('button', {
          class: 'category-head', type: 'button', 'aria-expanded': String(open),
          onClick: () => {
            collapsed.has(category.name) ? collapsed.delete(category.name) : collapsed.add(category.name);
            savePref('collapsedCategories', [...collapsed]);
            render();
          },
        }, category.name, icon('chevronDown')),
        h('div', { class: 'tile-grid' }, category.tools.map((tool) => tile(tool.name, icon(tool.icon), { kind: 'element', id: tool.id }))));
    });
  }

  function layoutCards() {
    return [
      h('p', { class: 'add-hint' }, 'Ready-made sections. Click to add one at the bottom, or drag it to where you want it.'),
      h('div', { class: 'layout-grid' }, LAYOUTS.map((layout) => tile(layout.name,
        h('span', { class: 'layout-preview', innerHTML: `<svg viewBox="0 0 52 30" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><rect x="0.7" y="0.7" width="50.6" height="28.6" rx="3" opacity="0.5"/>${layout.preview}</svg>` }),
        { kind: 'layout', id: layout.id }, layout.hint))),
    ];
  }

  function tile(name, visual, payload, hint) {
    const button = h('button', {
      class: `tile tile-${payload.kind}`, type: 'button', draggable: true, title: hint ? `${name}: ${hint}` : `Add ${name.toLowerCase()}`,
      onClick: () => add(payload),
    }, h('span', { class: 'tile-visual' }, visual), h('span', { class: 'tile-name' }, name), hint && h('span', { class: 'tile-hint' }, hint));
    button.addEventListener('dragstart', (event) => {
      event.dataTransfer.setData(DRAG_TYPE, JSON.stringify(payload));
      event.dataTransfer.effectAllowed = 'copy';
    });
    return button;
  }

  function syncDisabled(state) {
    const disabled = !state.dashboard || state.mode !== 'edit';
    root.querySelectorAll('.tile').forEach((b) => { b.disabled = disabled; });
  }
  store.subscribe((state, prev) => {
    if (state.dashboard !== prev.dashboard || state.mode !== prev.mode) syncDisabled(state);
  });

  // ---- Adding --------------------------------------------------------------------

  const ctx = { store, canvas };

  function add(payload, point = null) {
    if (payload.kind === 'layout') return addLayout(ctx, LAYOUT_MAP.get(payload.id), point);
    if (payload.id === 'section') return addSection(ctx, point);
    return addElement(ctx, TOOLS.get(payload.id), point);
  }

  // Dropping a tile on the canvas.
  let highlighted = null;
  const highlight = (node) => {
    if (highlighted === node) return;
    highlighted?.classList.remove('is-drop-target');
    node?.classList.add('is-drop-target');
    highlighted = node;
  };
  viewport.addEventListener('dragover', (event) => {
    if (!event.dataTransfer?.types.includes(DRAG_TYPE) || store.getState().mode !== 'edit') return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    highlight(event.target.closest('.section'));
  });
  viewport.addEventListener('dragleave', (event) => {
    if (!viewport.contains(event.relatedTarget)) highlight(null);
  });
  viewport.addEventListener('drop', (event) => {
    if (!event.dataTransfer?.types.includes(DRAG_TYPE) || store.getState().mode !== 'edit') return;
    event.preventDefault();
    highlight(null);
    add(JSON.parse(event.dataTransfer.getData(DRAG_TYPE)), canvas.toCanvasPoint({ x: event.clientX, y: event.clientY }));
  });

  render();
}

function addSection({ store, canvas }, point = null, preset = null) {
  const d = store.getState().dashboard;
  const bottom = Math.max(0, ...d.sections.map((s) => s.y + s.height));
  const width = d.canvasWidth - SECTION_GAP * 2;
  const section = {
    id: uuid(),
    x: SECTION_GAP,
    y: point ? Math.max(0, Math.round(point.y / 8) * 8) : d.sections.length ? bottom + SECTION_GAP : SECTION_GAP,
    width,
    height: preset?.height ?? 280,
    zIndex: 1,
    style: preset?.style ?? DEFAULT_SECTION_STYLE,
    elements: (preset?.elements ?? []).map((e) => ({ id: uuid(), zIndex: 1, ...e })),
  };
  store.dispatch({ type: 'section/add', section, select: { kind: 'section', id: section.id } });
  canvas.reveal(section.id);
  return section;
}

function addLayout(ctx, layout, point) {
  const width = ctx.store.getState().dashboard.canvasWidth - SECTION_GAP * 2;
  addSection(ctx, point, layout.build(width));
}

function addElement(ctx, tool, point) {
  const { store, canvas } = ctx;
  const state = store.getState();
  const d = state.dashboard;
  const section = (point ? sectionAt(d, point) : targetSection(state)) ?? addSection(ctx, point);

  const made = tool.make();
  const width = Math.min(made.width, section.width - INSET * 2);
  const height = made.height;
  const spot = point
    ? {
      x: clamp(Math.round((point.x - section.x - width / 2) / 8) * 8, 0, section.width - width),
      y: Math.max(0, Math.round((point.y - section.y - height / 2) / 8) * 8),
    }
    : findSpot(section, width, height);

  const element = { id: uuid(), type: made.type, ...spot, width, height, zIndex: 1, content: made.content };
  store.dispatch({ type: 'element/add', sectionId: section.id, element, select: { kind: 'element', id: element.id } });
  canvas.reveal(element.id);
}

/** The selected section, the section of the selected element, or the last section. */
function targetSection(state) {
  const d = state.dashboard;
  const found = findItem(d, state.selection?.id);
  return found?.section ?? d.sections[d.sections.length - 1] ?? null;
}

/**
 * The first free spot (top-to-bottom, left-to-right) where a box fits without
 * overlapping existing elements. Falls back to just below the lowest element;
 * the store grows the section to fit.
 */
function findSpot(section, width, height) {
  const step = 8;
  const overlaps = (x, y) => section.elements.some((e) =>
    x < e.x + e.width + step && x + width + step > e.x && y < e.y + e.height + step && y + height + step > e.y);

  for (let y = INSET; y + height <= section.height - INSET; y += step) {
    for (let x = INSET; x + width <= section.width - INSET; x += step) {
      if (!overlaps(x, y)) return { x, y };
    }
  }
  const bottom = Math.max(0, ...section.elements.map((e) => e.y + e.height));
  return { x: INSET, y: bottom + INSET };
}
