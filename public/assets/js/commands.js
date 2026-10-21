import { registry } from './elements/index.js';
import { findItem, stackPosition } from './store.js';
import { toast, uuid } from './utils.js';

const OFFSET = 16;
const SECTION_GAP = 24;

export function createCommands(store, canvas) {
  let clipboard = null;

  const state = () => store.getState();
  const canEdit = () => Boolean(state().dashboard) && state().mode === 'edit';
  const selected = () => state().selection?.id ?? null;
  const find = (id) => findItem(state().dashboard, id);

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
      while (section.elements.some((e) => e.x === item.x && e.y === item.y)) {
        item.x += OFFSET;
        item.y += OFFSET;
      }
      insert('element', item, { sectionId: section.id, afterId: found?.kind === 'element' ? found.item.id : null });
    },

    layer(op, id = selected()) {
      if (find(id) && canEdit()) store.dispatch({ type: 'item/layer', id, op });
    },

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

export function shortcut(key, { alt = false } = {}) {
  if (isMac) return `${alt ? '⌥' : ''}⌘${key}`;
  return `Ctrl+${alt ? 'Alt+' : ''}${key}`;
}
