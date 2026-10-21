/**
 * Editing commands shared by keyboard shortcuts, the context menu and the
 * properties panel: duplicate, copy/cut/paste, layer order, move, delete.
 */

import { registry } from './elements/index.js';
import { findItem, stackPosition } from './store.js';
import { toast, uuid } from './utils.js';

const OFFSET = 16;      // a copy sits this far down-right of its original
const SECTION_GAP = 24;

export function createCommands(store, canvas) {
  /** In-memory clipboard; survives switching dashboards in the same tab. */
  let clipboard = null; // { kind: 'section' | 'element', item }

  const state = () => store.getState();
  const canEdit = () => Boolean(state().dashboard) && state().mode === 'edit';
  const selected = () => state().selection?.id ?? null;
  const find = (id) => findItem(state().dashboard, id);

  /** A copy of an item with fresh ids (and fresh ids for a section's elements). */
  function withNewIds(kind, item) {
    const copy = structuredClone(item);
    copy.id = uuid();
    if (kind === 'section') copy.elements.forEach((e) => { e.id = uuid(); });
    return copy;
  }

  function insert(kind, item, { sectionId = null, afterId = null } = {}) {
    store.dispatch({ type: 'item/insert', item, sectionId, afterId, select: { kind, id: item.id } });
    canvas.reveal(item.id);
  }

  function describe(found) {
    return found.kind === 'section' ? 'section' : registry[found.item.type].label.toLowerCase();
  }

  return {
    hasClipboard: () => clipboard !== null,

    duplicate(id = selected()) {
      const found = find(id);
      if (!found || !canEdit()) return;
      const copy = withNewIds(found.kind, found.item);
      if (found.kind === 'element') {
        copy.x += OFFSET;
        copy.y += OFFSET;
        insert('element', copy, { sectionId: found.section.id, afterId: id });
      } else {
        copy.y = found.item.y + found.item.height + SECTION_GAP;
        insert('section', copy, { afterId: id });
      }
    },

    copy(id = selected()) {
      const found = find(id);
      if (!found) return false;
      clipboard = { kind: found.kind, item: structuredClone(found.item) };
      toast(`Copied ${describe(found)}.`, { timeout: 1500 });
      return true;
    },

    cut(id = selected()) {
      const found = find(id);
      if (!found || !canEdit()) return;
      clipboard = { kind: found.kind, item: structuredClone(found.item) };
      store.dispatch({ type: 'item/remove', id });
    },

    /** Pastes into the selected section (or the selected element's section), else the last one. */
    paste() {
      if (!clipboard || !canEdit()) return;
      const d = state().dashboard;
      const found = find(selected());
      const item = withNewIds(clipboard.kind, clipboard.item);

      if (clipboard.kind === 'section') {
        const after = found?.section ?? d.sections[d.sections.length - 1] ?? null;
        item.y = after ? after.y + after.height + SECTION_GAP : SECTION_GAP;
        insert('section', item, { afterId: after?.id ?? null });
        return;
      }
      const section = found?.section ?? d.sections[d.sections.length - 1];
      if (!section) {
        toast('Add a section first, then paste into it.', { error: true });
        return;
      }
      // Don't land exactly on top of something already there.
      while (section.elements.some((e) => e.x === item.x && e.y === item.y)) {
        item.x += OFFSET;
        item.y += OFFSET;
      }
      insert('element', item, { sectionId: section.id, afterId: found?.kind === 'element' ? found.item.id : null });
    },

    /** op: 'front' | 'forward' | 'backward' | 'back' */
    layer(op, id = selected()) {
      if (find(id) && canEdit()) store.dispatch({ type: 'item/layer', id, op });
    },

    /** Whether a layer move would change anything (for disabling buttons). */
    canLayer(op, id = selected()) {
      const pos = stackPosition(state().dashboard, id);
      if (!pos || pos.count < 2) return false;
      return op === 'front' || op === 'forward' ? pos.index < pos.count - 1 : pos.index > 0;
    },

    moveToSection(id, sectionId) {
      const found = find(id);
      if (!found || found.kind !== 'element' || found.section.id === sectionId || !canEdit()) return;
      store.dispatch({ type: 'element/move', id, sectionId, x: found.item.x, y: found.item.y });
      canvas.reveal(id);
    },

    remove(id = selected()) {
      if (find(id) && canEdit()) store.dispatch({ type: 'item/remove', id });
    },
  };
}

const isMac = /Mac|iPhone|iPad/.test(navigator.platform);

/** Shortcut label for menus and tooltips, e.g. shortcut('D') -> "⌘D" or "Ctrl+D". */
export function shortcut(key, { alt = false } = {}) {
  if (isMac) return `${alt ? '⌥' : ''}⌘${key}`;
  return `Ctrl+${alt ? 'Alt+' : ''}${key}`;
}
