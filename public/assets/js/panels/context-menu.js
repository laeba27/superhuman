/** Right-click menu on the canvas, with the same commands as the keyboard shortcuts. */

import { shortcut } from '../commands.js';
import { h, icon } from '../utils.js';

export function createContextMenu(viewport, store, commands) {
  const menu = h('div', { class: 'menu context-menu', role: 'menu', hidden: true, dataset: { ui: '' } });
  document.body.append(menu);

  viewport.addEventListener('contextmenu', (event) => {
    const state = store.getState();
    if (!state.dashboard || state.mode !== 'edit') return;
    // While typing, keep the browser's own menu (spelling suggestions, copy/paste).
    if (event.target.closest('[contenteditable="true"]')) return;
    event.preventDefault();
    const target = event.target.closest('.element, .section');
    store.dispatch({ type: 'select', selection: target ? { kind: target.dataset.kind, id: target.dataset.id } : null });
    open(event.clientX, event.clientY, target?.dataset.id ?? null);
  });

  function open(x, y, id) {
    const item = (label, iconName, keys, run, disabled = false) => h('button', {
      class: 'menu-item', type: 'button', role: 'menuitem', disabled,
      onClick: () => { close(); run(); },
    }, h('span', { class: 'menu-row' },
      h('span', { class: 'menu-label' }, icon(iconName), label),
      keys && h('kbd', { class: 'menu-keys' }, keys)));
    const sep = () => h('div', { class: 'menu-sep' });

    const paste = item('Paste', 'paste', shortcut('V'), () => commands.paste(), !commands.hasClipboard());
    menu.replaceChildren(...(id
      ? [
        item('Duplicate', 'duplicate', shortcut('D'), () => commands.duplicate(id)),
        item('Copy', 'duplicate', shortcut('C'), () => commands.copy(id)),
        paste,
        sep(),
        item('Bring to front', 'toFront', shortcut(']', { alt: true }), () => commands.layer('front', id), !commands.canLayer('front', id)),
        item('Bring forward', 'forward', shortcut(']'), () => commands.layer('forward', id), !commands.canLayer('forward', id)),
        item('Send backward', 'backward', shortcut('['), () => commands.layer('backward', id), !commands.canLayer('backward', id)),
        item('Send to back', 'toBack', shortcut('[', { alt: true }), () => commands.layer('back', id), !commands.canLayer('back', id)),
        sep(),
        item('Delete', 'trash', '⌫', () => commands.remove(id)),
      ]
      : [paste]));
    menu.lastElementChild.classList.toggle('is-danger', Boolean(id));

    // Show, then keep it inside the window.
    menu.hidden = false;
    const { width, height } = menu.getBoundingClientRect();
    menu.style.left = `${Math.min(x, innerWidth - width - 8)}px`;
    menu.style.top = `${Math.min(y, innerHeight - height - 8)}px`;
    menu.querySelector('.menu-item:not(:disabled)')?.focus();
  }

  function close() {
    menu.hidden = true;
  }

  document.addEventListener('pointerdown', (event) => { if (!menu.contains(event.target)) close(); }, true);
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') close(); });
  viewport.addEventListener('scroll', close);
  window.addEventListener('blur', close);
  store.subscribe((state, prev) => { if (state.mode !== prev.mode || state.dashboard?.id !== prev.dashboard?.id) close(); });
}
