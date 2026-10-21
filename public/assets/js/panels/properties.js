/**
 * Right panel: settings for the selection, or for the dashboard when nothing
 * is selected. The form is rebuilt only when the selection (or the shape of
 * its content, e.g. the number of chart rows) changes; on other updates each
 * field just refreshes its value.
 */

import { registry } from '../elements/index.js';
import { findItem } from '../store.js';
import { MAX_RADIUS, PRESET_FILLS, SHADOW_NAMES, fillCss } from '../styles.js';
import { shortcut } from '../commands.js';
import { h, icon, loadPref, savePref } from '../utils.js';
import { contentForm, structureKey } from './content-forms.js';
import { addableGroup, affix, createFieldKit, field, group, header, row } from './fields.js';

const GRADIENT = { type: 'linear', from: '#6d5dfc', to: '#c86dd7', angle: 135 };

export function createPropertiesPanel(root, store, actions) {
  const { commands } = actions;
  let renderedKey = null;
  let fields = [];
  let tab = loadPref('propertiesTab', 'content'); // for elements: 'content' | 'style'
  let aspect = null; // { id, ratio } while the W/H lock is on
  const kit = createFieldKit(store, (f) => fields.push(f));

  store.subscribe(render);

  function render(state) {
    const key = keyFor(state);
    if (key !== renderedKey) {
      renderedKey = key;
      fields = [];
      root.replaceChildren(...build(state));
    }
    for (const f of fields) {
      if (f.always || !f.input.contains(document.activeElement)) f.sync(state);
    }
  }

  function keyFor(state) {
    if (!state.dashboard) return 'none';
    const sel = state.selection;
    if (!sel) return `dashboard:${state.dashboard.id}`;
    const found = findItem(state.dashboard, sel.id);
    if (!found) return 'none';
    // The section count is in the key because the element form lists the sections.
    return `${sel.kind}:${sel.id}:${structureKey(found.item)}:${styleKey(found.item.style)}:${tab}:${state.dashboard.sections.length}`;
  }

  function build(state) {
    if (!state.dashboard) return [];
    const sel = state.selection;
    if (!sel) return dashboardForm(state.dashboard);
    const found = findItem(state.dashboard, sel.id);
    if (!found) return [];
    return found.kind === 'section' ? sectionForm(found.item) : elementForm(found.item);
  }

  // ---- Forms -------------------------------------------------------------------

  function dashboardForm(d) {
    const settings = (s) => s.dashboard.settings;
    const set = (key, coalesce = true) => (value) =>
      store.dispatch({ type: 'dashboard/settings', changes: { [key]: value }, coalesce: coalesce ? `settings:${key}` : null });
    const elementCount = d.sections.reduce((n, s) => n + s.elements.length, 0);

    return [
      tabBar([['settings', 'Settings']], 'settings'),
      header('Dashboard'),
      group('General',
        field('Name', kit.text((s) => s.dashboard.name,
          (name) => store.dispatch({ type: 'dashboard/rename', name: name.trim() ? name : 'Untitled dashboard', coalesce: 'rename' }),
          { maxLength: 120 }))),
      group('Canvas',
        row('Background', kit.color((s) => settings(s).background, set('background'))),
        row('Grid size', kit.number((s) => settings(s).gridSize, set('gridSize'), { min: 4, max: 64 })),
        kit.checkbox('Snap to grid', (s) => settings(s).snapToGrid, set('snapToGrid', false))),
      h('div', { class: 'props-info' },
        h('p', { class: 'props-meta' },
          `${d.sections.length} section${d.sections.length === 1 ? '' : 's'} · ${elementCount} element${elementCount === 1 ? '' : 's'}`),
        h('p', { class: 'props-empty' }, 'Select a section or element on the canvas to edit it.')),
    ];
  }

  function sectionForm(section) {
    const id = section.id;
    return [
      tabBar([['style', 'Style']], 'style'),
      header('Section'),
      ...design(id),
      layer(id),
      itemActions(id),
    ];
  }

  function elementForm(element) {
    const id = element.id;
    const type = registry[element.type];
    const head = [
      tabBar([['content', 'Content'], ['style', 'Style']], tab),
      header(type.label, type.name(element)),
    ];
    if (tab === 'content') return [...head, ...contentForm(kit, store, element, actions)];
    return [
      ...head,
      ...design(id),
      group('Section',
        field('Inside', kit.select(
          store.getState().dashboard.sections.map((s, i) => ({ value: s.id, label: `Section ${i + 1}` })),
          (s) => findItem(s.dashboard, id)?.section.id,
          (sectionId) => commands.moveToSection(id, sectionId)))),
      layer(id),
      itemActions(id),
    ];
  }

  /** Bring to front / forward / backward / send to back, plus the raw stack number. */
  function layer(id) {
    const ops = [
      ['back', 'toBack', 'Send to back', shortcut('[', { alt: true })],
      ['backward', 'backward', 'Send backward', shortcut('[')],
      ['forward', 'forward', 'Bring forward', shortcut(']')],
      ['front', 'toFront', 'Bring to front', shortcut(']', { alt: true })],
    ];
    const buttons = ops.map(([op, iconName, label, keys]) => h('button', {
      class: 'btn btn-icon', type: 'button', title: `${label} (${keys})`, 'aria-label': label,
      onClick: () => commands.layer(op, id),
    }, icon(iconName)));
    const bar = kit.watch(h('div', { class: 'button-row layer-buttons' }, buttons), () => {
      ops.forEach(([op], i) => { buttons[i].disabled = !commands.canLayer(op, id); });
    });
    return group('Layer',
      bar,
      row('Stack order', kit.number(
        (s) => findItem(s.dashboard, id)?.item.zIndex,
        (value) => store.dispatch({ type: 'item/update', id, changes: { zIndex: value }, coalesce: `${id}:z` }),
        { min: 0, max: 10000 })));
  }

  // ---- Design (Figma order: align, layout, appearance, fill, border, shadow) ----------

  function design(id) {
    return [alignBar(id), layout(id), appearance(id), fillGroup(id), borderGroup(id), shadowGroup(id)];
  }

  const itemOf = (state, id) => findItem(state.dashboard, id);
  const styleOf = (state, id) => itemOf(state, id)?.item.style;
  const setStyle = (id, changes, coalesce = null) =>
    store.dispatch({ type: 'item/update', id, changes: { style: changes }, coalesce });

  /**
   * Aligns the item to an edge or the middle of its parent: the section for
   * an element, the canvas for a section (which has no vertical bounds).
   */
  function alignBar(id) {
    const ops = [
      ['left', 'alignLeft', 'Align left'], ['center', 'alignCenter', 'Align horizontal centres'], ['right', 'alignRight', 'Align right'],
      ['top', 'alignTop', 'Align top'], ['middle', 'alignMiddle', 'Align vertical centres'], ['bottom', 'alignBottom', 'Align bottom'],
    ];
    const isSection = itemOf(store.getState(), id)?.kind === 'section';
    const align = (op) => {
      const state = store.getState();
      const found = itemOf(state, id);
      if (!found) return;
      const { item } = found;
      const parent = found.kind === 'section'
        ? { width: state.dashboard.canvasWidth, height: 0 }
        : { width: found.section.width, height: found.section.height };
      const changes = {
        left: { x: 0 }, center: { x: Math.round((parent.width - item.width) / 2) }, right: { x: parent.width - item.width },
        top: { y: 0 }, middle: { y: Math.round((parent.height - item.height) / 2) }, bottom: { y: parent.height - item.height },
      }[op];
      store.dispatch({ type: 'item/update', id, changes });
    };
    return h('div', { class: 'align-bar', role: 'group', 'aria-label': 'Align' }, ops.map(([op, iconName, label]) => h('button', {
      class: 'icon-btn', type: 'button', title: label, 'aria-label': label,
      disabled: isSection && ['top', 'middle', 'bottom'].includes(op),
      onClick: () => align(op),
    }, icon(iconName))));
  }

  /** X, Y, W, H, with a lock that keeps the width-to-height ratio. */
  function layout(id) {
    const locked = () => aspect?.id === id;
    const setSize = (key) => (value) => {
      const item = itemOf(store.getState(), id)?.item;
      if (!item) return;
      const changes = { [key]: value };
      if (locked()) {
        if (key === 'width') changes.height = Math.max(1, Math.round(value / aspect.ratio));
        else changes.width = Math.max(1, Math.round(value * aspect.ratio));
      }
      store.dispatch({ type: 'item/update', id, changes, coalesce: `${id}:size` });
    };
    const input = (label, key, min, set) => affix(kit.number(
      (s) => itemOf(s, id)?.item[key],
      set ?? ((value) => store.dispatch({ type: 'item/update', id, changes: { [key]: value }, coalesce: `${id}:${key}` })),
      { min }), label);

    const lock = h('button', {
      class: 'icon-btn lock-btn', type: 'button', title: 'Keep proportions', 'aria-label': 'Keep proportions',
      onClick: () => {
        const item = itemOf(store.getState(), id)?.item;
        aspect = locked() || !item ? null : { id, ratio: item.width / item.height };
        sync();
      },
    }, icon('lock'));
    const sync = () => lock.setAttribute('aria-pressed', String(locked()));
    kit.watch(lock, sync);

    return group('Layout',
      h('div', { class: 'field-grid layout-grid-fields' },
        input('X', 'x', 0), input('Y', 'y', 0), h('span'),
        input('W', 'width', 1, setSize('width')), input('H', 'height', 1, setSize('height')), lock));
  }

  function appearance(id) {
    return group('Appearance',
      row('Opacity', kit.range((s) => styleOf(s, id)?.opacity, (opacity) => setStyle(id, { opacity }, `${id}:opacity`),
        { min: 0, max: 100, unit: '%' })),
      row('Radius', kit.range((s) => styleOf(s, id)?.radius, (radius) => setStyle(id, { radius }, `${id}:radius`),
        { min: 0, max: MAX_RADIUS, sliderMax: 64, unit: 'px' })));
  }

  function fillGroup(id) {
    const fill = (s) => styleOf(s, id)?.fill ?? { type: 'none' };
    const setFill = (changes, coalesce = null) => setStyle(id, { fill: { ...fill(store.getState()), ...changes } }, coalesce);
    const switchType = (type) => {
      const current = fill(store.getState());
      if (current.type === type) return;
      if (type === 'none') setStyle(id, { fill: { type } });
      // Keep the colour the user had: a gradient starts from it (unless it's plain white),
      // a solid takes the gradient's first stop.
      if (type === 'solid') setStyle(id, { fill: { type, color: current.type === 'linear' ? current.from : '#ffffff' } });
      if (type === 'linear') {
        const keep = current.type === 'solid' && !/^#(fff|ffffff)$/i.test(current.color);
        setStyle(id, { fill: keep ? { ...GRADIENT, from: current.color } : GRADIENT });
      }
    };
    const type = fill(store.getState()).type;

    const fields = [];
    if (type === 'solid') {
      fields.push(row('Colour', kit.colorHex((s) => fill(s).color, (color) => setFill({ color }, `${id}:fill.color`))));
    }
    if (type === 'linear') {
      const preview = kit.watch(h('div', { class: 'gradient-preview' }), (s) => { preview.style.background = fillCss({ ...fill(s), angle: 90 }); });
      fields.push(
        preview,
        row('From', kit.colorHex((s) => fill(s).from, (from) => setFill({ from }, `${id}:fill.from`))),
        row('To', kit.colorHex((s) => fill(s).to, (to) => setFill({ to }, `${id}:fill.to`))),
        row('Angle', affix(kit.number((s) => fill(s).angle, (angle) => setFill({ angle }, `${id}:fill.angle`), { min: 0, max: 360 }), '°')));
    }

    return group('Fill',
      kit.segmented([{ value: 'none', label: 'None' }, { value: 'solid', label: 'Solid' }, { value: 'linear', label: 'Gradient' }],
        (s) => fill(s).type, switchType, 'Fill type'),
      ...fields,
      h('div', { class: 'swatches', role: 'group', 'aria-label': 'Preset fills' }, PRESET_FILLS.map((preset) => {
        const label = preset.type === 'solid' ? preset.color : `${preset.from} to ${preset.to}`;
        return h('button', {
          class: 'swatch-btn', type: 'button', title: label, 'aria-label': `Fill: ${label}`,
          style: { background: fillCss(preset) },
          onClick: () => setStyle(id, { fill: preset }),
        });
      })));
  }

  function borderGroup(id) {
    const border = (s) => styleOf(s, id)?.border ?? { width: 0, color: '#e3e6eb' };
    const setBorder = (changes, coalesce) => setStyle(id, { border: { ...border(store.getState()), ...changes } }, coalesce);
    return addableGroup('Border', border(store.getState()).width > 0, {
      onAdd: () => setBorder({ width: 1 }),
      onRemove: () => setBorder({ width: 0 }),
      build: () => [
        row('Colour', kit.colorHex((s) => border(s).color, (color) => setBorder({ color }, `${id}:border.color`), '#e3e6eb')),
        row('Width', affix(kit.number((s) => border(s).width, (width) => setBorder({ width: Math.max(1, width) }, `${id}:border.width`),
          { min: 1, max: 16 }), 'px')),
      ],
    });
  }

  function shadowGroup(id) {
    const shadow = (s) => styleOf(s, id)?.shadow ?? 'none';
    return addableGroup('Shadow', shadow(store.getState()) !== 'none', {
      onAdd: () => setStyle(id, { shadow: 'md' }),
      onRemove: () => setStyle(id, { shadow: 'none' }),
      build: () => [
        kit.segmented(['sm', 'md', 'lg', 'glow'].map((value) => ({ value, label: SHADOW_NAMES[value] })),
          shadow, (value) => setStyle(id, { shadow: value }), 'Shadow size'),
      ],
    });
  }

  function tabBar(tabs, active) {
    return h('div', { class: 'tabs props-tabs', role: 'tablist' }, tabs.map(([id, label]) => h('button', {
      class: 'tab', type: 'button', role: 'tab', 'aria-selected': String(id === active),
      onClick: () => {
        if (tabs.length < 2 || id === tab) return;
        tab = id;
        savePref('propertiesTab', tab);
        render(store.getState());
      },
    }, label)));
  }

  function itemActions(id) {
    return h('div', { class: 'props-actions' },
      h('button', { class: 'btn', type: 'button', title: `Duplicate (${shortcut('D')})`, onClick: () => commands.duplicate(id) },
        icon('duplicate'), 'Duplicate'),
      h('button', { class: 'btn btn-danger', type: 'button', title: 'Delete (⌫)', onClick: () => commands.remove(id) },
        icon('trash'), 'Delete'));
  }
}

/** Style changes that add or remove fields, so the form is rebuilt. */
function styleKey(style) {
  return style ? `${style.fill.type}:${style.border.width > 0}:${style.shadow !== 'none'}` : '';
}
