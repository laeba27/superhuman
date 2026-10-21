/** Small DOM and formatting helpers shared by the editor. */

/** UUID v4. crypto.randomUUID only exists on https/localhost, so build it by hand. */
export function uuid() {
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

/**
 * Creates an element. `props` keys starting with "on" become listeners,
 * `dataset`/`style` objects are merged, known DOM properties are assigned,
 * and anything else becomes an attribute.
 */
export function h(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key === 'style' && typeof value === 'object') Object.assign(node.style, value);
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key in node) node[key] = value;
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : String(child));
  }
  return node;
}

const ICONS = {
  section: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18"/>',
  text: '<path d="M5 6V4h14v2"/><path d="M12 4v16"/><path d="M9 20h6"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 17-5-5-9 8"/>',
  bar: '<path d="M4 20h16"/><path d="M7 16v-5"/><path d="M12 16V7"/><path d="M17 16v-8"/>',
  line: '<path d="M4 20h16"/><path d="m4 15 5-5 4 3 7-7"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
  redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9a5 5 0 0 0 0 10h3"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16v4Z"/>',
  plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  save: '<path d="M5 3h11l4 4v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 1-2Z"/><path d="M8 3v5h7"/><path d="M8 21v-7h8v7"/>',
  trash: '<path d="M4 7h16"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/>',
  close: '<path d="M6 6l12 12"/><path d="M18 6 6 18"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  chevronRight: '<path d="m9 6 6 6-6 6"/>',
  heading: '<path d="M6 4v16"/><path d="M18 4v16"/><path d="M6 12h12"/>',
  paragraph: '<path d="M4 6h16"/><path d="M4 10h16"/><path d="M4 14h16"/><path d="M4 18h10"/>',
  live: '<path d="M4 20h16"/><path d="m4 15 4-4 3 2 5-6"/><circle cx="19" cy="6" r="2"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5"/>',
  page: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>',
  desktop: '<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M8 20h8"/><path d="M12 16v4"/>',
  tablet: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M11 18h2"/>',
  mobile: '<rect x="7" y="3" width="10" height="18" rx="2"/><path d="M11 18h2"/>',
  play: '<path d="M7 4v16l13-8z"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  upload: '<path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M4 16v4h16v-4"/>',
  layout: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 9v12"/>',
  minus: '<path d="M5 12h14"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5V14"/><path d="M12 17h.01"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  duplicate: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  paste: '<rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4V3h6v1"/><path d="M9 10h6"/><path d="M9 14h4"/>',
  toFront: '<path d="M5 4h14"/><path d="M12 20V9"/><path d="m7 13 5-5 5 5"/>',
  forward: '<path d="M12 19V5"/><path d="m6 11 6-6 6 6"/>',
  backward: '<path d="M12 5v14"/><path d="m6 13 6 6 6-6"/>',
  toBack: '<path d="M5 20h14"/><path d="M12 4v11"/><path d="m7 11 5 5 5-5"/>',
  alignLeft: '<path d="M4 4v16"/><rect x="8" y="7" width="12" height="4" rx="1"/><rect x="8" y="14" width="7" height="4" rx="1"/>',
  alignCenter: '<path d="M12 4v3"/><path d="M12 11v3"/><path d="M12 18v2"/><rect x="6" y="7" width="12" height="4" rx="1"/><rect x="8.5" y="14" width="7" height="4" rx="1"/>',
  alignRight: '<path d="M20 4v16"/><rect x="4" y="7" width="12" height="4" rx="1"/><rect x="9" y="14" width="7" height="4" rx="1"/>',
  alignTop: '<path d="M4 4h16"/><rect x="7" y="8" width="4" height="12" rx="1"/><rect x="14" y="8" width="4" height="7" rx="1"/>',
  alignMiddle: '<path d="M4 12h3"/><path d="M11 12h3"/><path d="M18 12h2"/><rect x="7" y="6" width="4" height="12" rx="1"/><rect x="14" y="8.5" width="4" height="7" rx="1"/>',
  alignBottom: '<path d="M4 20h16"/><rect x="7" y="4" width="4" height="12" rx="1"/><rect x="14" y="9" width="4" height="7" rx="1"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  unlock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.5-2"/>',
};

/** An inline SVG icon from the fixed set above. */
export function icon(name) {
  const span = document.createElement('span');
  span.className = 'icon';
  span.style.display = 'contents';
  span.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
  return span;
}

const plain = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
const compact = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });

/** Formats a chart value. unit is "USD", "%" or "". */
export function formatValue(value, unit = '', { short = false } = {}) {
  if (unit === '%') return `${plain.format(value)}%`;
  const text = short ? compact.format(value) : plain.format(value);
  return unit === 'USD' ? `$${text}` : text;
}

/** Normalises a CSS color to #rrggbb for <input type="color">, or returns the fallback. */
export function toHex6(color, fallback = '#ffffff') {
  if (typeof color !== 'string') return fallback;
  if (/^#[0-9a-f]{6}$/i.test(color)) return color.toLowerCase();
  const short = color.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i);
  return short ? `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toLowerCase() : fallback;
}

/** CSS rgb()/rgba() string to #rrggbb. */
export function rgbToHex(color) {
  const m = String(color).match(/\d+/g);
  if (!m || m.length < 3) return '#000000';
  return `#${m.slice(0, 3).map((n) => Number(n).toString(16).padStart(2, '0')).join('')}`;
}

/** Plain text of an HTML string, parsed without running scripts or loading images. */
export function htmlToText(html) {
  // Put a space where blocks end, so "<h1>Title</h1><p>Body</p>" reads "Title Body".
  const spaced = html.replace(/<\/(p|div|h[1-6]|li|blockquote)>|<br\s*\/?>/gi, ' $&');
  return new DOMParser().parseFromString(spaced, 'text/html').body.textContent.replace(/\s+/g, ' ').trim();
}

/** Reads a remembered UI preference; storage can be unavailable (private mode, previews). */
export function loadPref(key, fallback) {
  try {
    const raw = localStorage.getItem(`dashboard-builder:${key}`);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function savePref(key, value) {
  try {
    localStorage.setItem(`dashboard-builder:${key}`, JSON.stringify(value));
  } catch {
    // Not remembered this time; nothing else depends on it.
  }
}

export function toast(message, { error = false, timeout = 4000 } = {}) {
  const root = document.getElementById('toasts');
  const node = h('div', { class: `toast${error ? ' is-error' : ''}`, role: error ? 'alert' : 'status' }, message);
  root.append(node);
  setTimeout(() => node.remove(), timeout);
}
