/** Modal shown when a save hits a newer version on the server (HTTP 409). */

import { h, icon } from '../utils.js';

export function createConflictDialog(store, saver) {
  const version = h('strong');
  const loadButton = h('button', { class: 'btn', type: 'button' }, 'Load latest version');
  const keepButton = h('button', { class: 'btn btn-primary', type: 'button' }, 'Keep my version');
  const dialog = h('dialog', { class: 'dialog', 'aria-labelledby': 'conflict-title' },
    h('div', { class: 'dialog-icon' }, icon('layers')),
    h('h2', { id: 'conflict-title' }, 'This dashboard changed somewhere else'),
    h('p', {}, 'A newer version (', version, ') was saved from another tab or window while you were editing. Your changes are still here and haven’t been saved.'),
    h('ul', { class: 'dialog-options' },
      h('li', {}, h('b', {}, 'Load latest version'), ' — discard your unsaved changes and show the newer version.'),
      h('li', {}, h('b', {}, 'Keep my version'), ' — save your version over it. The other changes are lost.')),
    h('div', { class: 'dialog-actions' }, loadButton, keepButton));
  document.body.append(dialog);

  loadButton.addEventListener('click', async () => {
    dialog.close();
    await saver.loadLatest();
  });
  keepButton.addEventListener('click', async () => {
    dialog.close();
    await saver.keepMine();
  });

  // Closing with Escape leaves the conflict unresolved; autosave stays paused
  // and the save status in the top bar reopens the dialog.
  store.subscribe((state, prev) => {
    if (state.saveStatus === 'conflict' && prev.saveStatus !== 'conflict') open(state);
    if (state.saveStatus !== 'conflict' && dialog.open) dialog.close();
  });

  function open(state = store.getState()) {
    if (state.saveStatus !== 'conflict' || dialog.open) return;
    version.textContent = `version ${state.conflictVersion}`;
    dialog.showModal();
    keepButton.focus();
  }

  return { open };
}
