/**
 * Rich text editing for text elements.
 *
 * Double-click a text element (or press Enter with it selected) to type in
 * it. A floating toolbar above the selected text element applies bold,
 * italic, underline, font size and colour, to the selected words while
 * typing, or to the whole text when the element is only selected.
 *
 * Formatting uses document.execCommand: still the only built-in way to
 * format a contenteditable selection, and supported by every current browser.
 * Font size and colour come out as <font> tags, which are converted to
 * <span style> straight away because the server only keeps span styles.
 */

import { findItem } from '../store.js';
import { h, rgbToHex, toHex6 } from '../utils.js';

const SIZES = [12, 14, 16, 18, 20, 24, 28, 32, 40, 48, 64];

export function createTextEditor({ viewport, store, canvas }) {
  let editing = null; // { id, node, body, key }
  let savedRange = null;
  let session = 0;

  // ---- Toolbar ---------------------------------------------------------------

  const commandButton = (command, label, title) => h('button', {
    class: 'tt-btn', type: 'button', title, 'aria-label': title, 'aria-pressed': 'false',
    onMousedown: (e) => e.preventDefault(), // keep the text selection
    onClick: () => format(() => document.execCommand(command)),
  }, label);

  const bold = commandButton('bold', h('b', {}, 'B'), 'Bold (Ctrl+B)');
  const italic = commandButton('italic', h('i', {}, 'I'), 'Italic (Ctrl+I)');
  const underline = commandButton('underline', h('u', {}, 'U'), 'Underline (Ctrl+U)');

  const customSize = h('option', { value: '', hidden: true });
  const size = h('select', { class: 'tt-select', 'aria-label': 'Font size', title: 'Font size' },
    SIZES.map((px) => h('option', { value: String(px) }, String(px))), customSize);
  size.addEventListener('change', () => format(() => setStyle('fontSize', `${size.value}px`), { wholeIfCollapsed: true }));

  const color = h('input', { class: 'tt-color', type: 'color', 'aria-label': 'Text colour', title: 'Text colour' });
  color.addEventListener('input', () =>
    format(() => setStyle('color', color.value), { wholeIfCollapsed: true, coalesce: 'color' }));

  const toolbar = h('div', { class: 'text-toolbar', role: 'toolbar', 'aria-label': 'Text formatting', hidden: true, dataset: { ui: '' } },
    bold, italic, underline, h('span', { class: 'tt-sep' }), size, h('span', { class: 'tt-unit' }, 'px'), h('span', { class: 'tt-sep' }), color);
  viewport.append(toolbar);

  // ---- Editing mode ------------------------------------------------------------

  function start(id, point) {
    if (store.getState().mode !== 'edit') return;
    if (editing?.id === id) return;
    stop();
    const node = canvas.nodeFor(id);
    const body = node?.querySelector('.text-body');
    if (!body) return;

    store.dispatch({ type: 'select', selection: { kind: 'element', id } });
    body.contentEditable = 'true';
    body.spellcheck = true;
    node.classList.add('is-editing');
    editing = { id, node, body, key: `text:${id}:${++session}` };
    body.addEventListener('input', onInput);
    body.addEventListener('keydown', onKeydown);
    body.addEventListener('paste', onPaste);
    body.focus();

    // Put the caret where the user double-clicked, or select everything.
    const range = point && caretRangeAt(point);
    if (range && body.contains(range.startContainer)) setRange(range);
    else selectAll(body);
    saveRange();
    refresh();
  }

  function stop() {
    if (!editing) return;
    const { node, body } = editing;
    editing = null;
    body.removeEventListener('input', onInput);
    body.removeEventListener('keydown', onKeydown);
    body.removeEventListener('paste', onPaste);
    body.removeAttribute('contenteditable');
    node.classList.remove('is-editing');
    const selection = getSelection();
    if (selection.rangeCount && body.contains(selection.anchorNode)) selection.removeAllRanges();
    savedRange = null;
    refresh();
  }

  function onInput() {
    commit(editing.id, editing.body, editing.key);
  }

  function onKeydown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation(); // the global Escape would also clear the selection
      stop();
    }
  }

  // Paste as plain text, so formatting from other sites doesn't come along.
  function onPaste(event) {
    event.preventDefault();
    document.execCommand('insertText', false, event.clipboardData.getData('text/plain'));
  }

  /** Saves the body's HTML, growing the element if the text no longer fits. */
  function commit(id, body, coalesce) {
    const found = findItem(store.getState().dashboard, id);
    if (!found) return;
    store.dispatch({
      type: 'element/fit',
      id,
      changes: { content: { html: body.innerHTML } },
      height: Math.ceil(body.scrollHeight),
      coalesce,
    });
  }

  // ---- Formatting --------------------------------------------------------------

  /** The text element the toolbar acts on: the one being edited, or the selected one. */
  function target() {
    if (editing) return editing;
    const state = store.getState();
    if (state.mode !== 'edit' || state.selection?.kind !== 'element') return null;
    const found = findItem(state.dashboard, state.selection.id);
    if (found?.item.type !== 'text') return null;
    const node = canvas.nodeFor(found.item.id);
    const body = node?.querySelector('.text-body');
    return body ? { id: found.item.id, node, body } : null;
  }

  function format(apply, { wholeIfCollapsed = false, coalesce = null } = {}) {
    const t = target();
    if (!t) return;
    const { id, body } = t;
    const temporary = !editing;

    if (temporary) {
      // Not typing: format the whole text.
      body.contentEditable = 'true';
      body.focus();
      selectAll(body);
    } else {
      body.focus();
      restoreRange(body);
      if (wholeIfCollapsed && getSelection().isCollapsed) selectAll(body);
    }

    document.execCommand('styleWithCSS', false, false);
    apply();
    convertFonts(body);

    if (temporary) {
      body.removeAttribute('contenteditable');
      getSelection().removeAllRanges();
    } else {
      saveRange();
    }
    commit(id, body, editing ? editing.key : coalesce && `${coalesce}:${id}`);
    refresh();
  }

  let pendingStyle = null;

  function setStyle(property, value) {
    pendingStyle = { property, value };
    if (property === 'fontSize') document.execCommand('fontSize', false, '7');
    else document.execCommand('foreColor', false, value);
  }

  /**
   * Turns the <font> tags execCommand made into <span style>, and lets the new
   * value win over older ones inside. Re-selects the converted text, because
   * replacing the nodes collapses the selection.
   */
  function convertFonts(body) {
    const spans = [];
    for (const font of [...body.querySelectorAll('font')]) {
      const span = document.createElement('span');
      if (font.getAttribute('size') === '7' && pendingStyle?.property === 'fontSize') span.style.fontSize = pendingStyle.value;
      if (font.hasAttribute('color')) span.style.color = font.getAttribute('color');
      span.append(...font.childNodes);
      font.replaceWith(span);
      spans.push(span);
      if (pendingStyle) {
        for (const inner of span.querySelectorAll('[style]')) {
          inner.style[pendingStyle.property] = '';
          if (!inner.getAttribute('style')) inner.removeAttribute('style');
        }
      }
    }
    pendingStyle = null;
    if (spans.length && editing) {
      const range = document.createRange();
      range.setStart(spans[0], 0);
      const last = spans[spans.length - 1];
      range.setEnd(last, last.childNodes.length);
      setRange(range);
    }
  }

  // ---- Selection helpers -------------------------------------------------------

  function selectAll(body) {
    const range = document.createRange();
    range.selectNodeContents(body);
    setRange(range);
  }

  function setRange(range) {
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function saveRange() {
    const selection = getSelection();
    if (editing && selection.rangeCount && editing.body.contains(selection.anchorNode)) {
      savedRange = selection.getRangeAt(0).cloneRange();
    }
  }

  function restoreRange(body) {
    if (savedRange && body.contains(savedRange.startContainer)) setRange(savedRange);
  }

  function caretRangeAt({ x, y }) {
    if (document.caretRangeFromPoint) return document.caretRangeFromPoint(x, y);
    const pos = document.caretPositionFromPoint?.(x, y);
    if (!pos) return null;
    const range = document.createRange();
    range.setStart(pos.offsetNode, pos.offset);
    return range;
  }

  // ---- Toolbar state and position ------------------------------------------------

  function refresh() {
    const t = target();
    toolbar.hidden = !t;
    if (!t) return;
    syncControls(t);
    position(t);
  }

  function syncControls(t) {
    const typing = editing && document.activeElement === t.body;
    for (const [button, command] of [[bold, 'bold'], [italic, 'italic'], [underline, 'underline']]) {
      button.setAttribute('aria-pressed', String(Boolean(typing && document.queryCommandState(command))));
    }
    const anchor = typing && savedRange ? savedRange.startContainer : t.body.querySelector('*') ?? t.body;
    const el = anchor.nodeType === Node.TEXT_NODE ? anchor.parentElement : anchor;
    const styles = getComputedStyle(el);
    const px = String(Math.round(parseFloat(styles.fontSize)));
    customSize.value = px;
    customSize.textContent = px;
    customSize.hidden = SIZES.includes(Number(px));
    if (document.activeElement !== size) size.value = px;
    if (document.activeElement !== color) color.value = toHex6(rgbToHex(styles.color), '#000000');
  }

  function position(t) {
    const r = t.node.getBoundingClientRect();
    const v = viewport.getBoundingClientRect();
    const height = toolbar.offsetHeight;
    const roomAbove = r.top - v.top > height + 36; // leave space for the element's tag
    const top = (roomAbove ? r.top - v.top - height - 30 : r.bottom - v.top + 10) + viewport.scrollTop;
    const left = Math.min(r.left - v.left, v.width - toolbar.offsetWidth - 8) + viewport.scrollLeft;
    toolbar.style.transform = `translate(${Math.max(8, left)}px, ${top}px)`;
  }

  // ---- Wiring ------------------------------------------------------------------

  viewport.addEventListener('dblclick', (event) => {
    const node = event.target.closest('.element-text');
    if (node) start(node.dataset.id, { x: event.clientX, y: event.clientY });
  });

  document.addEventListener('keydown', (event) => {
    if (editing || event.key !== 'Enter' || event.target.closest('input, textarea, select, button, [contenteditable="true"]')) return;
    const t = target();
    if (t) {
      event.preventDefault();
      start(t.id);
    }
  });

  // Clicking anywhere outside the text (and its toolbar) finishes editing.
  document.addEventListener('pointerdown', (event) => {
    if (editing && !editing.node.contains(event.target) && !toolbar.contains(event.target)) stop();
  }, true);

  document.addEventListener('selectionchange', () => {
    if (!editing) return;
    saveRange();
    syncControls(editing);
  });

  store.subscribe((state) => {
    if (editing && (state.mode !== 'edit' || state.selection?.id !== editing.id || !findItem(state.dashboard, editing.id))) stop();
    refresh();
  });
  viewport.addEventListener('scroll', refresh);
  window.addEventListener('resize', refresh);

  return { start, stop };
}
