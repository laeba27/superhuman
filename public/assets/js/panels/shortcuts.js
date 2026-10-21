/** Keyboard shortcuts sheet, opened with "?" or the help button on the rail. */

import { shortcut } from '../commands.js';
import { h } from '../utils.js';

const GROUPS = [
  ['General', [
    [shortcut('S'), 'Save now (autosave also runs after each edit)'],
    [shortcut('Z'), 'Undo'],
    [`${shortcut('Z').replace('Z', '')}Shift+Z`, 'Redo'],
    ['?', 'Show this list'],
  ]],
  ['Selection', [
    ['Esc', 'Deselect, or stop editing text'],
    ['Delete', 'Delete the selection'],
    ['Arrows', 'Nudge 1 px (Shift: one grid step)'],
    ['Alt + drag', 'Move or resize without snapping'],
  ]],
  ['Arrange', [
    [shortcut('D'), 'Duplicate'],
    [`${shortcut('C')} / ${shortcut('X')} / ${shortcut('V')}`, 'Copy, cut, paste'],
    [`${shortcut(']')} / ${shortcut('[')}`, 'Bring forward / send backward'],
    [`${shortcut(']', { alt: true })} / ${shortcut('[', { alt: true })}`, 'Bring to front / send to back'],
  ]],
  ['Text', [
    ['Double-click / Enter', 'Edit text'],
    [`${shortcut('B')} / ${shortcut('I')} / ${shortcut('U')}`, 'Bold, italic, underline while typing'],
  ]],
  ['View', [
    [`${shortcut('+')} / ${shortcut('−')}`, 'Zoom in / out (or Ctrl + scroll)'],
    [shortcut('0'), 'Fit to screen'],
  ]],
];

export function createShortcutsDialog() {
  const close = h('button', { class: 'btn', type: 'button', onClick: () => dialog.close() }, 'Close');
  const dialog = h('dialog', { class: 'dialog shortcuts-dialog', 'aria-labelledby': 'shortcuts-title' },
    h('h2', { id: 'shortcuts-title' }, 'Keyboard shortcuts'),
    h('div', { class: 'shortcut-groups' }, GROUPS.map(([title, rows]) => h('section', {},
      h('h3', {}, title),
      h('dl', {}, rows.flatMap(([keys, what]) => [h('dt', {}, h('kbd', {}, keys)), h('dd', {}, what)]))))),
    h('div', { class: 'dialog-actions' }, close));
  document.body.append(dialog);

  return {
    open() {
      if (!dialog.open) dialog.showModal();
      close.focus();
    },
  };
}
