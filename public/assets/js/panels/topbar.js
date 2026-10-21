/** Top bar: dashboard menu, device widths, save status, undo/redo, preview and save. */

import { DEVICE_WIDTHS } from '../canvas.js';
import { h, icon } from '../utils.js';

const DEVICES = [
  { id: 'desktop', label: 'Desktop', icon: 'desktop' },
  { id: 'tablet', label: 'Tablet', icon: 'tablet' },
  { id: 'mobile', label: 'Mobile', icon: 'mobile' },
];

export function createTopbar(root, store, { onOpen, onCreate, onDelete, onSave, onRetry, onResolve, onCopyLink }) {
  // ---- Dashboard menu --------------------------------------------------------

  const chipLabel = h('span', { class: 'chip-label' });
  const chip = h('button', { class: 'chip', type: 'button', 'aria-haspopup': 'menu', 'aria-expanded': 'false', title: 'Dashboards' },
    icon('page'), chipLabel, icon('chevronDown'));
  const menu = h('div', { class: 'menu', role: 'menu', hidden: true });
  const menuWrap = h('div', { class: 'menu-wrap' }, chip, menu);

  const setMenu = (open) => {
    menu.hidden = !open;
    chip.setAttribute('aria-expanded', String(open));
    if (open) renderMenu(store.getState());
  };
  chip.addEventListener('click', () => setMenu(menu.hidden));
  document.addEventListener('pointerdown', (e) => { if (!menuWrap.contains(e.target)) setMenu(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setMenu(false); });

  function renderMenu(state) {
    const item = (label, onClick, extra = {}) => h('button', { class: 'menu-item', type: 'button', role: 'menuitem', ...extra,
      onClick: () => { setMenu(false); onClick(); } }, label);
    menu.replaceChildren(
      h('div', { class: 'menu-title' }, 'Dashboards'),
      ...state.dashboards.map((d) => item(
        h('span', { class: 'menu-row' }, h('span', {}, d.name), d.id === state.dashboard?.id ? icon('check') : null),
        () => onOpen(d.id),
        { 'aria-current': d.id === state.dashboard?.id ? 'true' : null })),
      h('div', { class: 'menu-sep' }),
      item(h('span', { class: 'menu-row' }, h('span', {}, 'New dashboard'), icon('plus')), onCreate),
      item(h('span', { class: 'menu-row' }, h('span', {}, 'Copy preview link'), icon('link')), onCopyLink, { disabled: !state.dashboard }),
      item(h('span', { class: 'menu-row' }, h('span', {}, 'Delete this dashboard'), icon('trash')), onDelete,
        { class: 'menu-item is-danger', disabled: state.dashboards.length < 2 }),
    );
  }

  // ---- Devices ------------------------------------------------------------------

  const deviceButtons = DEVICES.map((d) => h('button', {
    class: 'icon-btn', type: 'button', title: `${d.label} width`, 'aria-label': `${d.label} width`,
    onClick: () => store.dispatch({ type: 'ui/device', device: d.id }),
  }, icon(d.icon)));
  const width = h('span', { class: 'device-width' });

  // ---- Right side ------------------------------------------------------------------

  // A button so a failed save or a conflict can be acted on from here.
  const status = h('button', { class: 'save-status', type: 'button', 'aria-live': 'polite', onClick: () => {
    const { saveStatus } = store.getState();
    if (saveStatus === 'retrying' || saveStatus === 'error') onRetry();
    else if (saveStatus === 'conflict') onResolve();
  } });
  let countdown = null;
  const undo = h('button', { class: 'icon-btn', type: 'button', title: 'Undo (Ctrl+Z)', 'aria-label': 'Undo',
    onClick: () => store.dispatch({ type: 'history/undo' }) }, icon('undo'));
  const redo = h('button', { class: 'icon-btn', type: 'button', title: 'Redo (Ctrl+Shift+Z)', 'aria-label': 'Redo',
    onClick: () => store.dispatch({ type: 'history/redo' }) }, icon('redo'));
  const preview = h('button', { class: 'icon-btn', type: 'button', onClick: () => {
    const { mode } = store.getState();
    store.dispatch({ type: 'mode/set', mode: mode === 'edit' ? 'preview' : 'edit' });
  } });
  const save = h('button', { class: 'btn btn-primary', type: 'button', title: 'Save (Ctrl+S)', onClick: onSave }, 'Save');

  root.append(
    h('div', { class: 'topbar-left' },
      h('div', { class: 'brand', title: 'Dashboard Builder' }, h('img', { src: 'assets/img/sample-logo.svg', alt: 'Dashboard Builder' })),
      menuWrap),
    h('div', { class: 'topbar-center' }, h('div', { class: 'device-group', role: 'group', 'aria-label': 'Preview width' }, deviceButtons), width),
    h('div', { class: 'topbar-right' }, status, undo, redo, h('span', { class: 'divider' }), preview, save),
  );

  store.subscribe((state) => {
    const d = state.dashboard;
    chipLabel.textContent = d?.name ?? 'Loading…';
    chip.disabled = !state.dashboards.length;
    if (!menu.hidden) renderMenu(state);

    DEVICES.forEach((device, i) => deviceButtons[i].setAttribute('aria-pressed', String(state.device === device.id)));
    width.textContent = `${DEVICE_WIDTHS[state.device] ?? d?.canvasWidth ?? 1200} PX`;

    renderStatus(state);
    // Tick the retry countdown once a second.
    if (state.saveStatus === 'retrying' && !countdown) countdown = setInterval(() => renderStatus(store.getState()), 1000);
    if (state.saveStatus !== 'retrying' && countdown) { clearInterval(countdown); countdown = null; }

    undo.disabled = !state.history.past.length || state.mode !== 'edit';
    redo.disabled = !state.history.future.length || state.mode !== 'edit';

    const editing = state.mode === 'edit';
    preview.replaceChildren(icon(editing ? 'play' : 'edit'));
    preview.title = editing ? 'Preview' : 'Back to editing';
    preview.setAttribute('aria-label', preview.title);
    preview.setAttribute('aria-pressed', String(!editing));
    preview.disabled = !d;
    save.disabled = !d || !state.dirty || state.saveStatus === 'saving' || state.saveStatus === 'conflict';
  });

  function renderStatus(state) {
    const s = statusOf(state);
    status.replaceChildren(...(s.icon ? [icon(s.icon)] : []), s.text, ...(s.action ? [h('span', { class: 'status-action' }, s.action)] : []));
    status.className = `save-status ${s.className}`;
    status.title = state.saveError ?? '';
    status.disabled = !s.action;
  }
}

function statusOf(state) {
  if (!state.dashboard) return { text: '', className: '' };
  switch (state.saveStatus) {
    case 'saving':
      return { text: 'Saving…', className: '' };
    case 'retrying': {
      const seconds = Math.max(0, Math.ceil((state.retryAt - Date.now()) / 1000));
      return { icon: 'upload', text: `Offline · retrying in ${seconds}s`, action: 'Retry now', className: 'is-error' };
    }
    case 'error':
      return { text: 'Couldn’t save', action: 'Retry', className: 'is-error' };
    case 'conflict':
      return { text: 'Changed elsewhere', action: 'Resolve', className: 'is-error' };
  }
  if (state.dirty) return { text: 'Unsaved changes', className: 'is-dirty' };
  return { icon: 'check', text: 'Saved', className: 'is-saved' };
}
