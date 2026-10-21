/**
 * The single source of truth for the editor. Every change goes through
 * dispatch(action); subscribers re-render from the new state.
 *
 * The dashboard is never mutated: each change builds new objects along the
 * changed path, so renderers can skip anything whose reference is unchanged.
 */

import { normalizeDashboard, withStyle } from './styles.js';
import { clamp } from './utils.js';

export const MIN_SECTION_SIZE = 48;
export const MIN_ELEMENT_SIZE = 24;
const MAX_COORD = 20000;
const HISTORY_LIMIT = 100;

const initialState = {
  dashboards: [],          // list from GET /api/dashboards
  dashboard: null,         // the open layout tree
  selection: null,         // { kind: 'section' | 'element', id }
  mode: 'edit',            // 'edit' | 'preview'
  device: 'desktop',       // 'desktop' | 'tablet' | 'mobile' — the width the canvas is shown at
  zoom: 'fit',             // 'fit' or a scale factor, e.g. 1 for 100%
  loading: true,
  loadError: null,
  dirty: false,
  revision: 0,             // bumps on every edit; lets a save know if edits happened meanwhile
  saveStatus: 'idle',      // 'idle' | 'saving' | 'saved' | 'retrying' | 'error' | 'conflict'
  saveError: null,
  retryAt: null,           // when status is 'retrying': ms timestamp of the next attempt
  conflictVersion: null,   // when status is 'conflict': the newer version on the server
  history: { past: [], future: [] },
  lastCoalesce: null,
};

export function createStore() {
  let state = initialState;
  const listeners = new Set();
  return {
    getState: () => state,
    dispatch(action) {
      const prev = state;
      state = reducer(state, action);
      if (state !== prev) listeners.forEach((fn) => fn(state, prev, action));
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

// ---- Lookups ---------------------------------------------------------------

/** Finds a section or element by id. Returns { kind, item, section } or null. */
export function findItem(dashboard, id) {
  if (!dashboard || !id) return null;
  for (const section of dashboard.sections) {
    if (section.id === id) return { kind: 'section', item: section, section };
    const element = section.elements.find((e) => e.id === id);
    if (element) return { kind: 'element', item: element, section };
  }
  return null;
}

// ---- Reducer ---------------------------------------------------------------

function reducer(state, action) {
  switch (action.type) {
    case 'dashboards/listed':
      return { ...state, dashboards: action.list };

    case 'load/start':
      return { ...state, loading: true, loadError: null };

    case 'load/error':
      return { ...state, loading: false, loadError: action.message };

    case 'dashboard/loaded':
      return {
        ...state,
        dashboard: action.dashboard && normalizeDashboard(action.dashboard),
        loading: false,
        loadError: null,
        // A refresh from another tab keeps what's selected, if it still exists.
        selection: action.keepSelection ? keepSelection(action.dashboard, state.selection) : null,
        dirty: false,
        saveStatus: 'idle',
        saveError: null,
        retryAt: null,
        conflictVersion: null,
        history: { past: [], future: [] },
        lastCoalesce: null,
      };

    case 'select':
      if (sameSelection(state.selection, action.selection)) return state;
      return { ...state, selection: action.selection, lastCoalesce: null };

    case 'ui/device':
      // A new width starts at "fit" again.
      return state.device === action.device ? state : { ...state, device: action.device, zoom: 'fit' };

    case 'ui/zoom':
      return state.zoom === action.zoom ? state : { ...state, zoom: action.zoom };

    case 'mode/set':
      return state.mode === action.mode ? state : { ...state, mode: action.mode, selection: null };

    case 'save/start':
      if (state.dashboard?.id !== action.id) return state;
      return { ...state, saveStatus: 'saving', saveError: null, retryAt: null };

    case 'save/success':
      // Ignore a save that finishes after another dashboard was opened.
      if (state.dashboard?.id !== action.id) return state;
      return {
        ...state,
        // Keep local content (it may have changed during the request); take the new version.
        dashboard: { ...state.dashboard, version: action.version, updatedAt: action.updatedAt },
        dirty: state.revision !== action.revision,
        saveStatus: 'saved',
      };

    case 'save/error':
      if (state.dashboard?.id !== action.id) return state;
      return { ...state, saveStatus: 'error', saveError: action.message, retryAt: null };

    case 'save/retrying':
      if (state.dashboard?.id !== action.id) return state;
      return { ...state, saveStatus: 'retrying', saveError: action.message, retryAt: action.retryAt };

    case 'save/conflict':
      if (state.dashboard?.id !== action.id) return state;
      return { ...state, saveStatus: 'conflict', conflictVersion: action.version, saveError: action.message };

    case 'save/keep-mine':
      // Overwrite the newer server copy: save on top of its version.
      if (state.dashboard?.id !== action.id || state.saveStatus !== 'conflict') return state;
      return {
        ...state,
        dashboard: { ...state.dashboard, version: state.conflictVersion },
        dirty: true,
        saveStatus: 'idle',
        conflictVersion: null,
        saveError: null,
      };

    case 'history/undo':
    case 'history/redo':
      return travel(state, action.type === 'history/undo' ? 'past' : 'future');
  }

  if (!state.dashboard) return state;
  const next = edit(state.dashboard, action);
  if (next === state.dashboard) return state;

  // Typing in a number field or dragging sends many actions with the same
  // `coalesce` key; they become one undo step.
  const merge = action.coalesce != null && action.coalesce === state.lastCoalesce;
  return {
    ...state,
    dashboard: next,
    selection: action.select ?? keepSelection(next, state.selection),
    dirty: true,
    revision: state.revision + 1,
    history: merge
      ? state.history
      : { past: [...state.history.past, state.dashboard].slice(-HISTORY_LIMIT), future: [] },
    lastCoalesce: action.coalesce ?? null,
  };
}

/** Changes to the dashboard itself. Returns the same object when nothing changed. */
function edit(d, action) {
  switch (action.type) {
    case 'dashboard/rename':
      return action.name === d.name ? d : { ...d, name: action.name };

    case 'dashboard/settings': {
      const settings = { ...d.settings, ...action.changes };
      return shallowEqual(settings, d.settings) ? d : { ...d, settings };
    }

    case 'section/add':
      return { ...d, sections: [...d.sections, fitSection(styledSection(action.section), d.canvasWidth)] };

    case 'element/add': {
      const target = d.sections.find((s) => s.id === action.sectionId);
      if (!target) return d;
      const el = withStyle('element', action.element);
      // Grow the section if the new element would stick out of the bottom.
      const height = Math.max(target.height, el.y + el.height + 16);
      const sections = growSection(d.sections, target.id, height).map((s) =>
        (s.id === target.id ? { ...s, elements: [...s.elements, fitElement(el, s.width, height)] } : s));
      return { ...d, sections };
    }

    case 'item/update':
      return updateItem(d, action.id, action.changes);

    case 'element/fit':
      return fitContent(d, action);

    case 'element/move':
      return moveElement(d, action);

    case 'item/remove':
      return removeItem(d, action.id);

    case 'item/insert':
      return action.item.elements
        ? insertSection(d, styledSection(action.item), action.afterId)
        : insertElement(d, action.sectionId, withStyle('element', action.item), action.afterId);

    case 'item/layer':
      return reorderLayer(d, action.id, action.op);

    default:
      return d;
  }
}

// ---- Inserting copies ----------------------------------------------------------

/** New and pasted items may come without a style, or with the pre-styles shape. */
const styledSection = (s) => ({ ...withStyle('section', s), elements: s.elements.map((e) => withStyle('element', e)) });

const SECTION_GAP = 24;

/** Adds an element (a copy or a paste) to a section, after `afterId` if given, growing the section to fit. */
function insertElement(d, sectionId, element, afterId = null) {
  const target = d.sections.find((s) => s.id === sectionId);
  if (!target) return d;
  const width = Math.min(element.width, target.width);
  const el = { ...element, width, x: clamp(element.x, 0, target.width - width) };
  const height = Math.max(target.height, el.y + el.height);
  const sections = growSection(d.sections, sectionId, height).map((s) =>
    (s.id === sectionId ? { ...s, elements: insertAfter(s.elements, fitElement(el, s.width, height), afterId) } : s));
  return { ...d, sections };
}

/**
 * Adds a section (a copy or a paste) at its own y, moving the sections from
 * there down by its height so it doesn't land on top of them.
 */
function insertSection(d, section, afterId = null) {
  const s = fitSection(section, d.canvasWidth);
  const shift = s.height + SECTION_GAP;
  const moved = d.sections.map((other) =>
    (other.y >= s.y && other.x < s.x + s.width && other.x + other.width > s.x ? { ...other, y: other.y + shift } : other));
  return { ...d, sections: insertAfter(moved, s, afterId) };
}

function insertAfter(list, item, afterId) {
  const index = afterId ? list.findIndex((x) => x.id === afterId) : -1;
  return index < 0 ? [...list, item] : [...list.slice(0, index + 1), item, ...list.slice(index + 1)];
}

// ---- Layer order ---------------------------------------------------------------

/**
 * Siblings (elements of one section, or all sections) in stacking order,
 * bottom first: by zIndex, then by position in the list.
 */
function stackOf(d, id) {
  const found = findItem(d, id);
  if (!found) return null;
  const siblings = found.kind === 'element' ? found.section.elements : d.sections;
  const order = siblings
    .map((item, i) => ({ item, i }))
    .sort((a, b) => a.item.zIndex - b.item.zIndex || a.i - b.i)
    .map((x) => x.item.id);
  return { found, siblings, order };
}

/** Where an item sits in its stack: { index (0 = bottom), count }. */
export function stackPosition(d, id) {
  const stack = stackOf(d, id);
  return stack ? { index: stack.order.indexOf(id), count: stack.order.length } : null;
}

/** op: 'front' | 'forward' | 'backward' | 'back'. Renumbers the siblings 1..n in their new order. */
function reorderLayer(d, id, op) {
  const stack = stackOf(d, id);
  if (!stack) return d;
  const { found, siblings, order } = stack;
  const from = order.indexOf(id);
  const last = order.length - 1;
  const to = { front: last, forward: Math.min(from + 1, last), backward: Math.max(from - 1, 0), back: 0 }[op] ?? from;

  const next = order.filter((x) => x !== id);
  next.splice(to, 0, id);
  const rank = new Map(next.map((x, i) => [x, i + 1]));
  const renumbered = siblings.map((item) => (item.zIndex === rank.get(item.id) ? item : { ...item, zIndex: rank.get(item.id) }));
  if (renumbered.every((item, i) => item === siblings[i])) return d;

  if (found.kind === 'section') return { ...d, sections: renumbered };
  return { ...d, sections: d.sections.map((s) => (s.id === found.section.id ? { ...s, elements: renumbered } : s)) };
}

function updateItem(d, id, changes) {
  const resized = 'width' in changes || 'height' in changes;
  let changed = false;
  const sections = d.sections.map((s) => {
    if (s.id === id) {
      const next = fitSection(merge(s, changes), d.canvasWidth, resized);
      if (sameItem(next, s)) return s;
      changed = true;
      // A smaller section pulls its elements back inside.
      const elements = next.width === s.width && next.height === s.height
        ? next.elements
        : next.elements.map((e) => fitElement(e, next.width, next.height));
      return { ...next, elements };
    }
    let inner = false;
    const elements = s.elements.map((e) => {
      if (e.id !== id) return e;
      const next = fitElement(merge(e, changes), s.width, s.height, resized);
      if (sameItem(next, e)) return e;
      inner = changed = true;
      return next;
    });
    return inner ? { ...s, elements } : s;
  });
  return changed ? { ...d, sections } : d;
}

/** Moves an element to (x, y) in a section, which may be a different one. */
function moveElement(d, { id, sectionId, x, y }) {
  const found = findItem(d, id);
  const target = d.sections.find((s) => s.id === sectionId);
  if (!found || found.kind !== 'element' || !target) return d;
  const { item, section: source } = found;
  if (source.id === sectionId && item.x === x && item.y === y) return d;

  // Dropping below the bottom edge grows the section rather than clamping.
  const height = Math.max(target.height, Math.round(y) + item.height);
  const moved = fitElement({ ...item, x, y }, target.width, height);

  const sections = growSection(d.sections, sectionId, height).map((s) => {
    if (s.id === sectionId) {
      const elements = s.id === source.id
        ? s.elements.map((e) => (e.id === id ? moved : e))
        : [...s.elements, moved];
      return { ...s, elements };
    }
    if (s.id === source.id) return { ...s, elements: s.elements.filter((e) => e.id !== id) };
    return s;
  });
  return { ...d, sections };
}

/**
 * Applies content changes and grows the element to `height` if its content
 * no longer fits (e.g. typed text). The section grows too when needed.
 */
function fitContent(d, { id, changes, height }) {
  const found = findItem(d, id);
  if (!found || found.kind !== 'element') return d;
  const { item, section } = found;
  const bottom = item.y + height;
  const base = bottom > section.height ? { ...d, sections: growSection(d.sections, section.id, bottom) } : d;
  return updateItem(base, id, height > item.height ? { ...changes, height } : changes);
}

/**
 * Grows a section to `height` and pushes the sections below it down by the
 * same amount, so automatic growth (adding, dropping, typing) never covers them.
 * Manual resizing doesn't use this; it leaves other sections where they are.
 */
function growSection(sections, id, height) {
  const grown = sections.find((s) => s.id === id);
  const delta = Math.round(height) - grown.height;
  if (delta <= 0) return sections;
  const oldBottom = grown.y + grown.height;
  return sections.map((s) => {
    if (s.id === id) return { ...s, height: grown.height + delta };
    const below = s.y >= oldBottom && s.x < grown.x + grown.width && s.x + s.width > grown.x;
    return below ? { ...s, y: s.y + delta } : s;
  });
}

function removeItem(d, id) {
  const sections = d.sections
    .filter((s) => s.id !== id)
    .map((s) => (s.elements.some((e) => e.id === id) ? { ...s, elements: s.elements.filter((e) => e.id !== id) } : s));
  const changed = sections.length !== d.sections.length || sections.some((s, i) => s !== d.sections[i]);
  return changed ? { ...d, sections } : d;
}

function travel(state, from) {
  const to = from === 'past' ? 'future' : 'past';
  const stack = state.history[from];
  if (!stack.length || !state.dashboard) return state;
  // The version belongs to the server, not to the content, so it never goes back.
  const dashboard = { ...stack[stack.length - 1], version: state.dashboard.version };
  return {
    ...state,
    dashboard,
    selection: keepSelection(dashboard, state.selection),
    dirty: true,
    revision: state.revision + 1,
    history: {
      [from]: stack.slice(0, -1),
      [to]: [...state.history[to], state.dashboard],
    },
    lastCoalesce: null,
  };
}

// ---- Geometry --------------------------------------------------------------

/** Merges changes; `content` and `style` are merged one level deep. */
function merge(item, changes) {
  const next = { ...item, ...changes };
  if (changes.content) next.content = { ...item.content, ...changes.content };
  if (changes.style) next.style = { ...item.style, ...changes.style };
  return next;
}

/**
 * Keeps a box inside a container of the given size, rounded to whole pixels.
 * When the size was edited, the position stays put and the size is capped;
 * otherwise (a move) the size stays put and the position is clamped.
 */
function fitBox(item, maxWidth, maxHeight, minSize, resized = false) {
  let x = Math.round(item.x);
  let y = Math.round(item.y);
  let width = Math.round(item.width);
  let height = Math.round(item.height);
  if (resized) {
    x = clamp(x, 0, maxWidth - minSize);
    y = clamp(y, 0, maxHeight - minSize);
    width = clamp(width, minSize, maxWidth - x);
    height = clamp(height, minSize, maxHeight - y);
  } else {
    width = clamp(width, minSize, maxWidth);
    height = clamp(height, minSize, maxHeight);
    x = clamp(x, 0, maxWidth - width);
    y = clamp(y, 0, maxHeight - height);
  }
  return x === item.x && y === item.y && width === item.width && height === item.height
    ? item
    : { ...item, x, y, width, height };
}

const fitSection = (s, canvasWidth, resized) => fitBox(s, canvasWidth, MAX_COORD, MIN_SECTION_SIZE, resized);
const fitElement = (e, sectionWidth, sectionHeight, resized) =>
  fitBox(e, sectionWidth, sectionHeight, Math.min(MIN_ELEMENT_SIZE, sectionWidth, sectionHeight), resized);

// ---- Comparisons -------------------------------------------------------------

function shallowEqual(a, b) {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((k) => a[k] === b[k]);
}

function sameItem(a, b) {
  return Object.keys(a).every((k) => {
    if (k === 'content' || k === 'style') return shallowEqual(a[k], b[k]);
    return a[k] === b[k];
  });
}

function sameSelection(a, b) {
  return a === b || (a && b && a.kind === b.kind && a.id === b.id);
}

function keepSelection(dashboard, selection) {
  return selection && findItem(dashboard, selection.id) ? selection : null;
}
