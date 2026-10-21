import { h, icon, loadPref, savePref, toHex6 } from '../utils.js';

const collapsedGroups = new Set(loadPref('collapsedGroups', []));

export function createFieldKit(store, register) {
  const track = (input, sync) => register({ input, sync });

  return {
    watch(node, sync) {
      register({ input: node, sync, always: true });
      return node;
    },

    number(get, set, { min, max, step = 1, integer = true } = {}) {
      const input = h('input', { class: 'input', type: 'number', step: integer ? step : 'any', min, max });
      input.addEventListener('input', () => {
        if (input.value === '') return;
        let value = Number(input.value);
        if (!Number.isFinite(value)) return;
        if (integer) value = Math.round(value);
        if (max != null) value = Math.min(value, max);
        set(value);
      });
      input.addEventListener('blur', () => sync(store.getState()));
      const sync = (state) => {
        const value = get(state);
        if (value != null) input.value = value;
      };
      track(input, sync);
      return input;
    },

    text(get, set, { placeholder = '', maxLength } = {}) {
      const input = h('input', { class: 'input', type: 'text', placeholder, maxLength });
      input.addEventListener('input', () => set(input.value));
      track(input, (state) => { input.value = get(state) ?? ''; });
      return input;
    },

    range(get, set, { min = 0, max, sliderMax = max, unit = '' } = {}) {
      const slider = h('input', { class: 'range', type: 'range', min, max: sliderMax });
      const number = this.number(get, set, { min, max });
      slider.addEventListener('input', () => {
        number.value = slider.value;
        set(Number(slider.value));
      });
      track(slider, (state) => { slider.value = get(state) ?? min; });
      return h('div', { class: 'range-field' }, slider, affix(number, unit));
    },

    colorHex(get, set, fallback = '#ffffff') {
      const swatch = h('input', { class: 'swatch-input', type: 'color', 'aria-label': 'Pick colour' });
      const text = h('input', { class: 'input hex-input', type: 'text', maxLength: 32, spellcheck: false, 'aria-label': 'Hex colour' });
      swatch.addEventListener('input', () => {
        text.value = swatch.value;
        set(swatch.value);
      });
      text.addEventListener('input', () => {
        const hex = parseHex(text.value);
        if (!hex) return;
        swatch.value = hex;
        set(hex);
      });
      const syncText = (state) => { text.value = get(state) ?? ''; };
      text.addEventListener('blur', () => syncText(store.getState()));
      track(swatch, (state) => { swatch.value = toHex6(get(state), fallback); });
      track(text, syncText);
      return h('div', { class: 'color-field' }, swatch, text);
    },

    color(get, set, fallback = '#ffffff') {
      const input = h('input', { class: 'input', type: 'color' });
      input.addEventListener('input', () => set(input.value));
      track(input, (state) => { input.value = toHex6(get(state), fallback); });
      return input;
    },

    checkbox(label, get, set) {
      const input = h('input', { type: 'checkbox' });
      input.addEventListener('change', () => set(input.checked));
      track(input, (state) => { input.checked = Boolean(get(state)); });
      return h('label', { class: 'field-check' }, input, label);
    },

    select(options, get, set) {
      const input = h('select', { class: 'input' }, options.map((o) => h('option', { value: o.value }, o.label)));
      input.addEventListener('change', () => set(input.value));
      track(input, (state) => { input.value = String(get(state)); });
      return input;
    },

    segmented(options, get, set, label) {
      const buttons = options.map((o) => h('button', {
        class: 'segment', type: 'button', onClick: () => set(o.value),
      }, o.label));
      const group = h('div', { class: 'segmented', role: 'group', 'aria-label': label }, buttons);
      track(group, (state) => {
        const value = get(state);
        buttons.forEach((b, i) => b.setAttribute('aria-pressed', String(options[i].value === value)));
      });
      return group;
    },
  };
}

export function header(title, name = '') {
  return h('div', { class: 'props-header' }, h('span', { class: 'props-type' }, title), name && h('span', { class: 'props-name' }, name));
}

export function group(title, ...children) {
  const node = h('section', { class: `pgroup${collapsedGroups.has(title) ? ' is-collapsed' : ''}` });
  const head = h('button', { class: 'pgroup-head', type: 'button', 'aria-expanded': String(!collapsedGroups.has(title)) },
    h('span', {}, title), icon('chevronDown'));
  head.addEventListener('click', () => {
    const collapse = !collapsedGroups.has(title);
    collapse ? collapsedGroups.add(title) : collapsedGroups.delete(title);
    savePref('collapsedGroups', [...collapsedGroups]);
    node.classList.toggle('is-collapsed', collapse);
    head.setAttribute('aria-expanded', String(!collapse));
  });
  node.append(head, h('div', { class: 'pgroup-body' }, ...children));
  return node;
}

export function addableGroup(title, on, { onAdd, onRemove, build }) {
  const label = `${on ? 'Remove' : 'Add'} ${title.toLowerCase()}`;
  return h('section', { class: `pgroup pgroup-addable${on ? '' : ' is-off'}` },
    h('div', { class: 'pgroup-head' },
      h('span', {}, title),
      h('button', { class: 'icon-btn pgroup-add', type: 'button', title: label, 'aria-label': label, onClick: on ? onRemove : onAdd },
        icon(on ? 'minus' : 'plus'))),
    on && h('div', { class: 'pgroup-body' }, ...build()));
}

export function affix(input, text) {
  return text ? h('label', { class: 'input-affix' }, input, h('span', { class: 'affix' }, text)) : input;
}

function parseHex(value) {
  const hex = value.trim().replace(/^#/, '');
  if (/^[0-9a-f]{6}$/i.test(hex)) return `#${hex.toLowerCase()}`;
  if (/^[0-9a-f]{3}$/i.test(hex)) return `#${[...hex].map((c) => c + c).join('').toLowerCase()}`;
  return null;
}

export function row(label, input) {
  return h('label', { class: 'field-row' }, h('span', { class: 'field-label' }, label), input);
}

export function field(label, input) {
  return h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), input);
}
