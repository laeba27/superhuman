/**
 * Drag and resize for sections and elements, using interact.js (global `interact`).
 *
 * Pointer positions are converted to canvas units on every move (the canvas
 * is CSS-scaled and the viewport scrolls), and positions snap to the
 * dashboard grid unless Alt is held.
 *
 * - Sections move and resize live through the store.
 * - Elements resize live through the store. While dragging, an element only
 *   moves visually (CSS transform) so it can leave its section; on drop it is
 *   committed once, into whichever section is under the pointer.
 */

import { findItem, MIN_ELEMENT_SIZE, MIN_SECTION_SIZE } from './store.js';
import { clamp } from './utils.js';

const EDGES = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];

export function createInteractions({ viewport, store, canvas }) {
  let active = null;
  let gesture = 0;

  const dashboard = () => store.getState().dashboard;
  const editing = () => store.getState().mode === 'edit';

  const toCanvas = (client) => canvas.toCanvasPoint(client);

  function snapper(event) {
    const { snapToGrid, gridSize } = dashboard().settings;
    const on = snapToGrid && !event.altKey;
    return (value) => (on ? Math.round(value / gridSize) * gridSize : Math.round(value));
  }

  const autoScroll = { container: viewport, margin: 48, speed: 700 };

  // ---- Sections ---------------------------------------------------------------

  interact('.section')
    .draggable({
      autoScroll,
      ignoreFrom: '.element, .handle',
      listeners: {
        start(event) {
          if (!editing()) return event.interaction.stop();
          const id = event.target.dataset.id;
          const { item } = findItem(dashboard(), id);
          const p = toCanvas(event.client);
          active = { id, grab: { x: p.x - item.x, y: p.y - item.y }, key: `drag:${id}:${++gesture}` };
          event.target.classList.add('is-dragging');
        },
        move(event) {
          if (!active) return;
          const p = toCanvas(event.client);
          const snap = snapper(event);
          store.dispatch({
            type: 'item/update',
            id: active.id,
            changes: { x: snap(p.x - active.grab.x), y: snap(p.y - active.grab.y) },
            coalesce: active.key,
          });
        },
        end(event) {
          event.target.classList.remove('is-dragging');
          active = null;
        },
      },
    })
    .resizable({ autoScroll, edges: edgeSelectors('section'), listeners: resizeListeners('section') });

  // ---- Elements ---------------------------------------------------------------

  interact('.element')
    .draggable({
      autoScroll,
      ignoreFrom: '.handle, [contenteditable="true"], [data-action]',
      listeners: {
        start(event) {
          if (!editing()) return event.interaction.stop();
          const id = event.target.dataset.id;
          const { item, section } = findItem(dashboard(), id);
          const p = toCanvas(event.client);
          active = {
            id,
            item,
            source: section,
            node: event.target,
            sourceNode: canvas.nodeFor(section.id),
            grab: { x: p.x - (section.x + item.x), y: p.y - (section.y + item.y) },
            target: section,
            pos: null,
          };
          active.sourceNode.classList.add('is-drag-source');
          active.node.classList.add('is-dragging');
        },
        move(event) {
          if (!active) return;
          const { item, source, grab } = active;
          const p = toCanvas(event.client);
          const snap = snapper(event);
          const target = sectionAt(dashboard(), p) ?? source;

          // Position inside the target section. The section grows downwards on drop if needed.
          const x = clamp(snap(p.x - grab.x - target.x), 0, Math.max(0, target.width - item.width));
          const y = Math.max(0, snap(p.y - grab.y - target.y));
          active.pos = { x, y };

          if (target !== active.target) {
            canvas.nodeFor(active.target.id)?.classList.remove('is-drop-target');
            active.target = target;
          }
          canvas.nodeFor(target.id)?.classList.toggle('is-drop-target', target.id !== source.id);

          const dx = target.x + x - (source.x + item.x);
          const dy = target.y + y - (source.y + item.y);
          active.node.style.transform = `translate(${dx}px, ${dy}px)`;
        },
        end() {
          if (!active) return;
          const { id, node, sourceNode, target, pos } = active;
          node.style.transform = '';
          node.classList.remove('is-dragging');
          sourceNode.classList.remove('is-drag-source');
          canvas.nodeFor(target.id)?.classList.remove('is-drop-target');
          active = null;
          if (pos) store.dispatch({ type: 'element/move', id, sectionId: target.id, x: pos.x, y: pos.y });
        },
      },
    })
    .resizable({ autoScroll, edges: edgeSelectors('element'), listeners: resizeListeners('element') });

  // ---- Resize (shared) -----------------------------------------------------------

  function resizeListeners(kind) {
    return {
      start(event) {
        if (!editing()) return event.interaction.stop();
        const id = event.target.dataset.id;
        const d = dashboard();
        const found = findItem(d, id);
        const { x, y, width, height } = found.item;
        active = {
          id,
          start: { x, y, width, height },
          p0: toCanvas(event.client),
          bounds: kind === 'section'
            ? { width: d.canvasWidth, height: Infinity }
            : { width: found.section.width, height: found.section.height },
          min: kind === 'section' ? MIN_SECTION_SIZE : MIN_ELEMENT_SIZE,
          key: `resize:${id}:${++gesture}`,
        };
        event.target.classList.add('is-resizing');
      },
      move(event) {
        if (!active) return;
        const { start, p0, bounds, min } = active;
        const p = toCanvas(event.client);
        const dx = p.x - p0.x;
        const dy = p.y - p0.y;
        const snap = snapper(event);
        const right = start.x + start.width;
        const bottom = start.y + start.height;
        let { x, y, width, height } = start;

        if (event.edges.left) {
          x = clamp(snap(start.x + dx), 0, right - min);
          width = right - x;
        }
        if (event.edges.right) width = clamp(snap(right + dx), x + min, bounds.width) - x;
        if (event.edges.top) {
          y = clamp(snap(start.y + dy), 0, bottom - min);
          height = bottom - y;
        }
        if (event.edges.bottom) height = clamp(snap(bottom + dy), y + min, bounds.height) - y;

        store.dispatch({ type: 'item/update', id: active.id, changes: { x, y, width, height }, coalesce: active.key });
      },
      end(event) {
        event.target.classList.remove('is-resizing');
        active = null;
      },
    };
  }
}

/** The handles each item gets; canvas.js draws them. */
export const HANDLE_EDGES = EDGES;

/** interact.js edge selectors, scoped by class so a section never grabs its elements' handles. */
function edgeSelectors(kind) {
  const sel = (...edges) => edges.map((e) => `.handle-${kind}.handle-${e}`).join(', ');
  return {
    top: sel('n', 'ne', 'nw'),
    bottom: sel('s', 'se', 'sw'),
    left: sel('w', 'nw', 'sw'),
    right: sel('e', 'ne', 'se'),
  };
}

/** The top-most section under a canvas point. */
export function sectionAt(dashboard, p) {
  return dashboard.sections
    .map((section, order) => ({ section, order }))
    .filter(({ section: s }) => p.x >= s.x && p.x <= s.x + s.width && p.y >= s.y && p.y <= s.y + s.height)
    .sort((a, b) => b.section.zIndex - a.section.zIndex || b.order - a.order)[0]?.section ?? null;
}
