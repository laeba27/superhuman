import { registry } from './elements/index.js';
import { HANDLE_EDGES } from './interactions.js';
import { skinCss } from './styles.js';
import { clamp, h } from './utils.js';

const CANVAS_PADDING_BOTTOM = 120;

export const DEVICE_WIDTHS = { desktop: null, tablet: 768, mobile: 390 };

const FLOW_BREAKPOINT = 640;
const FLOW_GAP = 12;

export function createCanvas({ viewport, stage, canvas, message, store }) {
  const nodes = new Map();
  let scale = 1;
  let fitScale = 1;
  let flowing = false;
  let selectedId = null;
  const layoutListeners = new Set();

  const emptyHint = h('div', { class: 'empty-hint', hidden: true },
    h('strong', {}, 'This dashboard is empty'),
    h('span', {}, 'Add a section, or drag a ready-made layout from the Add panel.'));
  stage.append(emptyHint);

  viewport.addEventListener('pointerdown', (event) => {
    const { mode } = store.getState();
    if (mode !== 'edit' || event.button !== 0 || event.target.closest('[data-ui]')) return;
    const target = event.target.closest('.element, .section');
    store.dispatch({
      type: 'select',
      selection: target ? { kind: target.dataset.kind, id: target.dataset.id } : null,
    });
  });

  new ResizeObserver(() => layout(store.getState())).observe(viewport);

  function render(state, prev) {
    showMessage(state);
    const d = state.dashboard;
    if (!d) {
      clear();
      return;
    }

    canvas.style.backgroundColor = d.settings.background;
    canvas.style.setProperty('--grid-size', `${Math.max(d.settings.gridSize * 2, 8)}px`);

    const seen = new Set();
    d.sections.forEach((section, index) => {
      const rec = nodes.get(section.id) ?? createSection(section);
      if (rec.item !== section) applySection(rec, section);
      if (canvas.children[index] !== rec.node) canvas.insertBefore(rec.node, canvas.children[index] ?? null);
      seen.add(section.id);

      section.elements.forEach((element, i) => {
        const erec = nodes.get(element.id) ?? createElement(element);
        if (erec.item !== element) applyElement(erec, element);
        if (rec.content.children[i] !== erec.node) rec.content.insertBefore(erec.node, rec.content.children[i] ?? null);
        seen.add(element.id);
      });
    });

    for (const [id, rec] of nodes) {
      if (!seen.has(id)) remove(id, rec);
    }

    const nextSelected = state.mode === 'edit' ? state.selection?.id ?? null : null;
    if (nextSelected !== selectedId) {
      nodes.get(selectedId)?.node.classList.remove('is-selected');
      nodes.get(nextSelected)?.node.classList.add('is-selected');
      selectedId = nextSelected;
    }

    emptyHint.hidden = d.sections.length > 0;
    emptyHint.classList.toggle('is-preview', state.mode !== 'edit');

    if (!prev || prev.dashboard !== d || prev.mode !== state.mode || prev.device !== state.device || prev.zoom !== state.zoom) {
      layout(state);
    }
  }

  function layout(state) {
    const d = state.dashboard;
    if (!d) return;
    const styles = getComputedStyle(viewport);
    const available = viewport.clientWidth - parseFloat(styles.paddingLeft) - parseFloat(styles.paddingRight);
    const device = DEVICE_WIDTHS[state.device];
    const frame = device ? Math.min(available, device) : available;
    fitScale = Math.min(1, frame / d.canvasWidth);

    if (state.mode === 'preview' && frame < FLOW_BREAKPOINT) {
      flow(d, frame);
    } else {
      if (flowing) unflow();
      const previous = scale;
      scale = state.mode === 'edit' && state.zoom !== 'fit' ? state.zoom : fitScale;

      const contentBottom = Math.max(0, ...d.sections.map((s) => s.y + s.height));
      const height = state.mode === 'edit'
        ? Math.max(contentBottom + CANVAS_PADDING_BOTTOM, (viewport.clientHeight - 48) / scale)
        : contentBottom + 24;

      const centre = previous !== scale ? {
        x: (viewport.scrollLeft + viewport.clientWidth / 2) / previous,
        y: (viewport.scrollTop + viewport.clientHeight / 2) / previous,
      } : null;

      canvas.style.width = `${d.canvasWidth}px`;
      canvas.style.height = `${height}px`;
      canvas.style.transform = `scale(${scale})`;
      canvas.style.setProperty('--scale', String(scale));
      stage.style.width = `${d.canvasWidth * scale}px`;
      stage.style.height = `${height * scale}px`;

      if (centre) {
        viewport.scrollLeft = centre.x * scale - viewport.clientWidth / 2;
        viewport.scrollTop = centre.y * scale - viewport.clientHeight / 2;
      }
    }
    layoutListeners.forEach((fn) => fn({ scale, fitScale, flowing }));
  }

  function flow(d, frame) {
    flowing = true;
    scale = 1;
    canvas.classList.add('is-flow');
    const sectionWidth = frame - FLOW_GAP * 2;
    const inner = sectionWidth - FLOW_GAP * 2;

    let y = FLOW_GAP;
    for (const section of readingOrder(d.sections)) {
      let ey = FLOW_GAP;
      for (const element of readingOrder(section.elements)) {
        const rec = nodes.get(element.id);
        const { width, height } = flowSize(rec, element, inner);
        Object.assign(rec.node.style, { left: `${FLOW_GAP}px`, top: `${ey}px`, width: `${width}px`, height: `${height}px` });
        ey += height + FLOW_GAP;
      }
      const height = Math.max(ey, 48);
      Object.assign(nodes.get(section.id).node.style, { left: `${FLOW_GAP}px`, top: `${y}px`, width: `${sectionWidth}px`, height: `${height}px` });
      y += height + FLOW_GAP;
    }

    canvas.style.width = `${frame}px`;
    canvas.style.height = `${y}px`;
    canvas.style.transform = 'none';
    canvas.style.setProperty('--scale', '1');
    stage.style.width = `${frame}px`;
    stage.style.height = `${y}px`;
  }

  function flowSize(rec, element, inner) {
    if (element.type === 'image') {
      const width = Math.min(element.width, inner);
      return { width, height: Math.round(Math.min((width * element.height) / element.width, 360)) };
    }
    if (element.type === 'chart') return { width: inner, height: clamp(element.height, 220, 280) };
    rec.node.style.width = `${inner}px`;
    rec.node.style.height = '0px';
    return { width: inner, height: Math.max(24, Math.ceil(rec.body.scrollHeight)) };
  }

  function unflow() {
    flowing = false;
    canvas.classList.remove('is-flow');
    for (const rec of nodes.values()) Object.assign(rec.node.style, boxStyle(rec.item));
  }

  function showMessage(state) {
    let text = '';
    if (state.loadError) text = state.loadError;
    else if (state.loading && !state.dashboard) text = 'Loading dashboard…';
    message.textContent = text;
    message.hidden = !text;
    message.classList.toggle('is-error', Boolean(state.loadError));
    stage.hidden = Boolean(text) && !state.dashboard;
  }

  function createSection(section) {
    const skin = h('div', { class: 'skin' });
    const content = h('div', { class: 'section-content' });
    const node = h('div', { class: 'section', dataset: { id: section.id, kind: 'section' } },
      h('div', { class: 'item-tag' }, 'Section'),
      skin,
      content,
      handles('section'));
    const rec = { node, skin, content, kind: 'section', item: null };
    nodes.set(section.id, rec);
    return rec;
  }

  function applySection(rec, s) {
    Object.assign(rec.node.style, boxStyle(s));
    if (rec.item?.style !== s.style) {
      paintSkin(rec.skin, s.style);
      rec.content.style.opacity = String(s.style.opacity / 100);
      rec.node.style.setProperty('--section-bg', s.style.fill.type === 'solid' ? s.style.fill.color : 'transparent');
    }
    rec.item = s;
  }

  function createElement(element) {
    const type = registry[element.type];
    const body = type.create(element);
    const skin = h('div', { class: 'skin' }, body);
    const node = h('div', { class: `element element-${element.type}`, dataset: { id: element.id, kind: 'element' } },
      h('div', { class: 'item-tag' }, type.label),
      skin,
      handles('element'));
    const rec = { node, skin, body, kind: 'element', type: element.type, item: element };
    nodes.set(element.id, rec);
    Object.assign(node.style, boxStyle(element));
    paintElement(rec, element);
    return rec;
  }

  function applyElement(rec, e) {
    Object.assign(rec.node.style, boxStyle(e));
    if (rec.item.content !== e.content) registry[e.type].update(rec.body, e, rec.item);
    if (rec.item.style !== e.style) paintElement(rec, e);
    rec.item = e;
  }

  function paintElement(rec, e) {
    paintSkin(rec.skin, e.style);
    rec.node.classList.toggle('has-fill', e.style.fill.type !== 'none');
  }

  function remove(id, rec) {
    if (rec.kind === 'element') registry[rec.type].destroy?.(rec.body);
    rec.node.remove();
    nodes.delete(id);
    if (selectedId === id) selectedId = null;
  }

  function clear() {
    for (const [id, rec] of nodes) remove(id, rec);
  }

  return {
    render,
    getScale: () => scale,
    onLayout: (fn) => layoutListeners.add(fn),
    nodeFor: (id) => nodes.get(id)?.node ?? null,
    toCanvasPoint(client) {
      const rect = canvas.getBoundingClientRect();
      return { x: (client.x - rect.left) / scale, y: (client.y - rect.top) / scale };
    },
    reveal(id) {
      nodes.get(id)?.node.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    },
  };
}

function readingOrder(items) {
  const rows = [];
  for (const item of [...items].sort((a, b) => a.y - b.y)) {
    const row = rows.find((r) => {
      const overlap = Math.min(r.bottom, item.y + item.height) - Math.max(r.top, item.y);
      return overlap >= Math.min(r.minHeight, item.height) / 2;
    });
    if (row) {
      row.items.push(item);
      row.bottom = Math.max(row.bottom, item.y + item.height);
      row.minHeight = Math.min(row.minHeight, item.height);
    } else {
      rows.push({ top: item.y, bottom: item.y + item.height, minHeight: item.height, items: [item] });
    }
  }
  return rows.flatMap((r) => r.items.sort((a, b) => a.x - b.x));
}

function handles(kind) {
  return h('div', { class: 'handles' },
    HANDLE_EDGES.map((edge) => h('div', { class: `handle handle-${kind} handle-${edge}`, dataset: { edge } })));
}

function paintSkin(skin, style) {
  for (const [key, value] of Object.entries(skinCss(style))) {
    if (key.startsWith('--')) skin.style.setProperty(key, value);
    else skin.style[key] = value;
  }
  skin.classList.toggle('has-border', style.border.width > 0);
}

function boxStyle(item) {
  return {
    left: `${item.x}px`,
    top: `${item.y}px`,
    width: `${item.width}px`,
    height: `${item.height}px`,
    zIndex: String(item.zIndex),
  };
}
