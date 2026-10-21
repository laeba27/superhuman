import { api } from './api.js';
import { createCanvas } from './canvas.js';
import { createCommands } from './commands.js';
import { createInteractions } from './interactions.js';
import { createConflictDialog } from './panels/conflict-dialog.js';
import { createContextMenu } from './panels/context-menu.js';
import { createBreadcrumbs } from './panels/breadcrumbs.js';
import { createLayersPanel } from './panels/layers.js';
import { createShortcutsDialog } from './panels/shortcuts.js';
import { createZoom } from './panels/zoom.js';
import { createPropertiesPanel } from './panels/properties.js';
import { createTextEditor } from './panels/text-toolbar.js';
import { createToolbox } from './panels/toolbox.js';
import { createTopbar } from './panels/topbar.js';
import { createStore, findItem } from './store.js';
import { createSaver } from './saver.js';
import { createUploads } from './uploads.js';
import { h, icon, loadPref, savePref, toast } from './utils.js';

const store = createStore();
const $ = (id) => document.getElementById(id);
const narrowScreen = matchMedia('(max-width: 767px)');

const canvas = createCanvas({
  viewport: $('viewport'),
  stage: $('stage'),
  canvas: $('canvas'),
  message: $('canvas-message'),
  store,
});
store.subscribe(canvas.render);
canvas.render(store.getState());
store.subscribe((state, prev) => {
  if (state.mode !== prev.mode) document.body.dataset.mode = state.mode;
  if (state.dashboard?.name !== prev.dashboard?.name) {
    document.title = state.dashboard ? `${state.dashboard.name} · Dashboard Builder` : 'Dashboard Builder';
  }
  if (state.mode === 'edit' && prev.mode === 'preview' && narrowScreen.matches) {
    toast('Editing works best on a larger screen. Use a tablet or computer to arrange the dashboard.', { timeout: 5000 });
  }
});

const viewport = $('viewport');
createInteractions({ viewport, store, canvas });
const textEditor = createTextEditor({ viewport, store, canvas });
const uploads = createUploads({ viewport, store, canvas });
const commands = createCommands(store, canvas);
createContextMenu(viewport, store, commands);
const saver = createSaver(store, { onSaved: syncListName, onRemoteDelete: deletedElsewhere });
const conflict = createConflictDialog(store, saver);

createTopbar($('topbar'), store, {
  onOpen: openDashboard,
  onCreate: createDashboard,
  onDelete: deleteDashboard,
  onSave: () => saver.save(),
  onRetry: () => saver.save(),
  onResolve: () => conflict.open(),
  onCopyLink: copyPreviewLink,
});
const zoom = createZoom($('zoom'), store, canvas, viewport);
const shortcutsDialog = createShortcutsDialog();
createToolbox($('add-panel'), store, canvas, viewport);
createLayersPanel($('layers-panel'), store, canvas);
createPropertiesPanel($('properties'), store, { editText: textEditor.start, pickImage: uploads.pick, commands });
createBreadcrumbs($('breadcrumbs'), store);
createRail();

function createRail() {
  const views = [
    { id: 'add', label: 'Add', icon: 'plus', panel: $('add-panel') },
    { id: 'layers', label: 'Layers', icon: 'layers', panel: $('layers-panel') },
  ];
  let current = loadPref('sideView', 'add');
  const buttons = views.map((view) => h('button', {
    class: 'icon-btn', type: 'button', title: view.label, 'aria-label': view.label,
    onClick: () => { current = view.id; savePref('sideView', current); show(); },
  }, icon(view.icon)));
  const show = () => views.forEach((view, i) => {
    view.panel.hidden = view.id !== current;
    buttons[i].setAttribute('aria-pressed', String(view.id === current));
  });
  const help = h('button', { class: 'icon-btn rail-bottom', type: 'button', title: 'Keyboard shortcuts (?)', 'aria-label': 'Keyboard shortcuts',
    onClick: () => shortcutsDialog.open() }, icon('help'));
  $('rail').append(...buttons, help);
  show();
}

async function boot() {
  const params = new URLSearchParams(location.search);
  if (params.get('view') === 'preview' || narrowScreen.matches) store.dispatch({ type: 'mode/set', mode: 'preview' });
  try {
    let list = await api.listDashboards();
    if (!list.length) {
      await api.createDashboard('My first dashboard');
      list = await api.listDashboards();
    }
    store.dispatch({ type: 'dashboards/listed', list });
    const wanted = new URLSearchParams(location.search).get('d');
    await openDashboard(list.some((d) => d.id === wanted) ? wanted : list[0].id);
  } catch (error) {
    store.dispatch({ type: 'load/error', message: error.message });
  }
}

async function openDashboard(id) {
  const state = store.getState();
  if (state.dashboard?.id === id) return true;
  if (state.dirty && !(await saver.flush())
    && !confirm('Your latest changes couldn’t be saved. Leave this dashboard anyway and lose them?')) return false;

  store.dispatch({ type: 'load/start' });
  try {
    const dashboard = await api.getDashboard(id);
    store.dispatch({ type: 'dashboard/loaded', dashboard });
    const view = new URLSearchParams(location.search).get('view');
    history.replaceState(null, '', `?d=${encodeURIComponent(id)}${view ? `&view=${encodeURIComponent(view)}` : ''}`);
    return true;
  } catch (error) {
    store.dispatch({ type: 'load/error', message: error.message });
    return false;
  }
}

async function createDashboard() {
  const name = prompt('Name for the new dashboard', 'Untitled dashboard');
  if (name === null) return;
  try {
    const created = await api.createDashboard(name.trim() || 'Untitled dashboard');
    await refreshList();
    await openDashboard(created.id);
  } catch (error) {
    toast(error.message, { error: true });
  }
}

async function deleteDashboard() {
  const { dashboard, dashboards } = store.getState();
  if (!dashboard || dashboards.length < 2) return;
  if (!confirm(`Delete “${dashboard.name}”? This can’t be undone.`)) return;
  try {
    store.dispatch({ type: 'dashboard/loaded', dashboard: null });
    await api.deleteDashboard(dashboard.id);
    saver.announceDelete(dashboard.id);
    await refreshList();
    await openDashboard(store.getState().dashboards[0].id);
    toast(`Deleted “${dashboard.name}”.`);
  } catch (error) {
    toast(error.message, { error: true });
    if (!store.getState().dashboard) await openDashboard(dashboard.id);
  }
}

async function copyPreviewLink() {
  const { dashboard } = store.getState();
  if (!dashboard) return;
  const url = new URL(location.href);
  url.search = new URLSearchParams({ d: dashboard.id, view: 'preview' }).toString();
  try {
    await navigator.clipboard.writeText(url.href);
    toast('Preview link copied. It opens this dashboard ready to view.');
  } catch {
    prompt('Copy this preview link:', url.href);
  }
}

async function refreshList() {
  store.dispatch({ type: 'dashboards/listed', list: await api.listDashboards() });
}

function syncListName(saved) {
  const listed = store.getState().dashboards.find((d) => d.id === saved.id);
  if (listed && listed.name !== saved.name) refreshList().catch(() => {});
}

async function deletedElsewhere() {
  store.dispatch({ type: 'dashboard/loaded', dashboard: null });
  toast('This dashboard was deleted in another tab.', { error: true, timeout: 6000 });
  try {
    await refreshList();
    const next = store.getState().dashboards[0];
    if (next) await openDashboard(next.id);
    else await boot();
  } catch (error) {
    store.dispatch({ type: 'load/error', message: error.message });
  }
}

document.addEventListener('keydown', (event) => {
  const mod = event.metaKey || event.ctrlKey;
  const key = event.key.toLowerCase();
  const state = store.getState();

  if (mod && key === 's') {
    event.preventDefault();
    saver.save();
    return;
  }
  if (mod && (key === '=' || key === '+' || key === '-' || key === '0') && state.mode === 'edit' && !event.target.closest('dialog')) {
    event.preventDefault();
    if (key === '0') zoom.fit();
    else if (key === '-') zoom.zoomOut();
    else zoom.zoomIn();
    return;
  }
  if (event.target.closest('input, textarea, select, dialog, [contenteditable="true"]') || state.mode !== 'edit') return;

  if (mod && (key === 'z' || key === 'y')) {
    event.preventDefault();
    store.dispatch({ type: key === 'y' || event.shiftKey ? 'history/redo' : 'history/undo' });
  } else if (mod && key === 'd' && state.selection) {
    event.preventDefault();
    commands.duplicate();
  } else if (mod && key === 'c' && state.selection) {
    commands.copy();
  } else if (mod && key === 'x' && state.selection) {
    commands.cut();
  } else if (mod && key === 'v' && commands.hasClipboard()) {
    event.preventDefault();
    commands.paste();
  } else if (mod && (event.code === 'BracketRight' || event.code === 'BracketLeft') && state.selection) {
    event.preventDefault();
    const up = event.code === 'BracketRight';
    commands.layer(event.altKey ? (up ? 'front' : 'back') : (up ? 'forward' : 'backward'));
  } else if (key === '?' && !mod) {
    shortcutsDialog.open();
  } else if (key === 'escape') {
    store.dispatch({ type: 'select', selection: null });
  } else if ((key === 'delete' || key === 'backspace') && state.selection) {
    event.preventDefault();
    commands.remove();
  } else if (key.startsWith('arrow') && state.selection) {
    event.preventDefault();
    const { item } = findItem(state.dashboard, state.selection.id);
    const step = event.shiftKey ? state.dashboard.settings.gridSize : 1;
    const dx = { arrowleft: -step, arrowright: step }[key] ?? 0;
    const dy = { arrowup: -step, arrowdown: step }[key] ?? 0;
    store.dispatch({ type: 'item/update', id: item.id, changes: { x: item.x + dx, y: item.y + dy }, coalesce: `nudge:${item.id}` });
  }
});

window.addEventListener('beforeunload', (event) => {
  if (store.getState().dirty || saver.isBusy()) event.preventDefault();
});

boot();
