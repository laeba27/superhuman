import { toHex6 } from './utils.js';

export const SHADOWS = {
  none: 'none',
  sm: '0 1px 2px rgba(16, 24, 40, 0.06), 0 1px 3px rgba(16, 24, 40, 0.10)',
  md: '0 4px 8px -2px rgba(16, 24, 40, 0.10), 0 2px 4px -2px rgba(16, 24, 40, 0.06)',
  lg: '0 20px 24px -4px rgba(16, 24, 40, 0.10), 0 8px 8px -4px rgba(16, 24, 40, 0.04)',
  glow: null,
};
export const SHADOW_NAMES = { none: 'None', sm: 'S', md: 'M', lg: 'L', glow: 'Glow' };

export const MAX_RADIUS = 200;

const BORDER = { width: 0, color: '#e3e6eb' };

export const DEFAULT_SECTION_STYLE = {
  fill: { type: 'solid', color: '#ffffff' },
  opacity: 100,
  radius: 12,
  border: { width: 1, color: '#e3e6eb' },
  shadow: 'none',
};

export const DEFAULT_ELEMENT_STYLE = {
  fill: { type: 'none' },
  opacity: 100,
  radius: 0,
  border: BORDER,
  shadow: 'none',
};

export const PRESET_FILLS = [
  { type: 'solid', color: '#ffffff' },
  { type: 'solid', color: '#f4f5f7' },
  { type: 'solid', color: '#16181d' },
  { type: 'linear', from: '#6d5dfc', to: '#c86dd7', angle: 135 },
  { type: 'linear', from: '#2a78d6', to: '#4fd1c5', angle: 135 },
  { type: 'linear', from: '#ff7a59', to: '#ffc75f', angle: 135 },
  { type: 'linear', from: '#f857a6', to: '#ff5858', angle: 135 },
  { type: 'linear', from: '#11998e', to: '#38ef7d', angle: 135 },
  { type: 'linear', from: '#1e1b4b', to: '#4338ca', angle: 160 },
  { type: 'linear', from: '#e0eafc', to: '#cfdef3', angle: 180 },
];

export function normalizeStyle(kind, item) {
  const style = item.style ?? {};
  const base = kind === 'section' ? sectionLegacy(style) : elementLegacy(item);
  return {
    fill: style.fill ?? base.fill,
    opacity: style.opacity ?? 100,
    radius: style.radius ?? base.radius,
    border: style.border ?? base.border,
    shadow: style.shadow ?? 'none',
  };
}

function sectionLegacy(style) {
  if (!('background' in style || 'borderColor' in style || 'borderRadius' in style)) return DEFAULT_SECTION_STYLE;
  const borderColor = style.borderColor ?? 'transparent';
  return {
    fill: { type: 'solid', color: style.background ?? '#ffffff' },
    radius: Math.min(style.borderRadius ?? 8, MAX_RADIUS),
    border: borderColor === 'transparent' ? BORDER : { width: 1, color: borderColor },
  };
}

function elementLegacy(item) {
  const radius = item.type === 'image' ? item.content?.borderRadius : null;
  return radius ? { ...DEFAULT_ELEMENT_STYLE, radius: Math.min(radius, MAX_RADIUS) } : DEFAULT_ELEMENT_STYLE;
}

export function withStyle(kind, item) {
  const next = { ...item, style: normalizeStyle(kind, item) };
  if (kind === 'element' && next.content && 'borderRadius' in next.content) {
    const { borderRadius, ...content } = next.content;
    next.content = content;
  }
  return next;
}

export function normalizeDashboard(d) {
  return {
    ...d,
    sections: d.sections.map((s) => ({
      ...withStyle('section', s),
      elements: s.elements.map((e) => withStyle('element', e)),
    })),
  };
}

export function fillCss(fill) {
  if (fill?.type === 'solid') return fill.color;
  if (fill?.type === 'linear') return `linear-gradient(${fill.angle}deg, ${fill.from}, ${fill.to})`;
  return 'transparent';
}

function boxShadow(style) {
  if (style.shadow !== 'glow') return SHADOWS[style.shadow] ?? 'none';
  const tint = toHex6(style.fill.type === 'linear' ? style.fill.to : style.fill.color, '#6d5dfc');
  return `0 12px 32px -8px ${withAlpha(tint, 0.55)}`;
}

export function skinCss(style) {
  return {
    background: fillCss(style.fill),
    opacity: String(style.opacity / 100),
    borderRadius: `${style.radius}px`,
    boxShadow: boxShadow(style),
    '--border-width': `${style.border.width}px`,
    '--border-color': style.border.color,
  };
}

export function withAlpha(hex, alpha) {
  const n = parseInt(toHex6(hex, '#000000').slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
