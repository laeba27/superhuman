/**
 * Saving: autosave after edits, retry when the network or server fails,
 * conflict detection (409) and keeping other tabs in sync.
 *
 * Only one save runs at a time. Edits made while it runs are saved right
 * after it finishes, so the server always ends up with the latest layout.
 */

import { api } from './api.js';
import { toast } from './utils.js';

const AUTOSAVE_DELAY = 1500;
const RETRY_DELAYS = [2000, 5000, 10000, 30000];

export function createSaver(store, { onSaved, onRemoteDelete } = {}) {
  let timer = null;
  let retryTimer = null;
  let inFlight = null;
  let attempt = 0;

  const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('dashboard-builder') : null;

  store.subscribe((state, prev) => {
    if (state.dashboard?.id !== prev.dashboard?.id) {
      // Another dashboard (or none) was opened: drop timers meant for the old one.
      cancel();
      attempt = 0;
      return;
    }
    if (state.revision !== prev.revision && state.dirty && canAutosave(state)) schedule(AUTOSAVE_DELAY);
  });

  const canAutosave = (state) => state.saveStatus !== 'conflict' && state.saveStatus !== 'retrying';

  function schedule(delay) {
    clearTimeout(timer);
    timer = setTimeout(() => save(), delay);
  }

  function cancel() {
    clearTimeout(timer);
    clearTimeout(retryTimer);
    timer = retryTimer = null;
  }

  /** Saves now. Resolves true once the server has the current layout. */
  async function save() {
    clearTimeout(timer);
    timer = null;
    if (inFlight) await inFlight;

    const state = store.getState();
    if (!state.dashboard) return true;
    if (state.saveStatus === 'conflict') return false;
    if (!state.dirty) return true;

    clearTimeout(retryTimer);
    const { dashboard, revision } = state;
    store.dispatch({ type: 'save/start', id: dashboard.id });

    inFlight = (async () => {
      try {
        const saved = await api.saveDashboard(dashboard);
        attempt = 0;
        store.dispatch({ type: 'save/success', id: saved.id, version: saved.version, updatedAt: saved.updatedAt, revision });
        channel?.postMessage({ type: 'saved', id: saved.id, version: saved.version });
        onSaved?.(saved);
        return true;
      } catch (error) {
        failed(error, dashboard.id);
        return false;
      }
    })();
    const ok = await inFlight;
    inFlight = null;

    // Edits made while the request was running get the normal autosave delay.
    if (ok && store.getState().dirty && canAutosave(store.getState())) schedule(AUTOSAVE_DELAY);
    return ok;
  }

  /** Saves until nothing is pending (used before leaving a dashboard). */
  async function flush() {
    let ok = await save();
    while (ok && store.getState().dirty) ok = await save();
    return ok;
  }

  function failed(error, id) {
    if (error.status === 409) {
      store.dispatch({ type: 'save/conflict', id, version: error.details.currentVersion, message: error.message });
      return;
    }
    // Network down (0) or a server-side failure: worth trying again.
    if (error.status === 0 || error.status >= 500) {
      const delay = RETRY_DELAYS[Math.min(attempt, RETRY_DELAYS.length - 1)];
      attempt += 1;
      store.dispatch({ type: 'save/retrying', id, retryAt: Date.now() + delay, message: error.message });
      clearTimeout(retryTimer);
      retryTimer = setTimeout(() => save(), delay);
      return;
    }
    // Anything else (e.g. 422) won't fix itself by retrying.
    store.dispatch({ type: 'save/error', id, message: error.message });
    const fields = error.details?.errors?.map((e) => `${e.field} ${e.message}`).slice(0, 3).join('; ');
    toast(fields ? `${error.message} ${fields}` : error.message, { error: true, timeout: 7000 });
  }

  // Back online: don't wait for the next retry.
  window.addEventListener('online', () => {
    if (store.getState().saveStatus === 'retrying') save();
  });

  // ---- Conflicts ----------------------------------------------------------------

  /** Throws away local changes and loads the newer version from the server. */
  async function loadLatest() {
    const { dashboard } = store.getState();
    if (!dashboard) return;
    try {
      const latest = await api.getDashboard(dashboard.id);
      store.dispatch({ type: 'dashboard/loaded', dashboard: latest, keepSelection: true });
      toast('Loaded the latest version.');
    } catch (error) {
      toast(error.message, { error: true });
    }
  }

  /** Saves local changes over the newer version on the server. */
  function keepMine() {
    const { dashboard } = store.getState();
    if (!dashboard) return Promise.resolve(false);
    store.dispatch({ type: 'save/keep-mine', id: dashboard.id });
    return save();
  }

  // ---- Other tabs ------------------------------------------------------------------

  channel?.addEventListener('message', async ({ data }) => {
    const state = store.getState();
    if (!state.dashboard || data.id !== state.dashboard.id) return;

    if (data.type === 'deleted') {
      onRemoteDelete?.(data.id);
      return;
    }
    if (data.type === 'saved' && data.version > state.dashboard.version) {
      // With unsaved edits here, the next save reports the conflict instead.
      if (state.dirty || state.saveStatus === 'saving') return;
      try {
        const latest = await api.getDashboard(data.id);
        const now = store.getState();
        if (now.dashboard?.id !== data.id || now.dirty) return;
        store.dispatch({ type: 'dashboard/loaded', dashboard: latest, keepSelection: true });
        toast('Updated with changes from another tab.', { timeout: 2500 });
      } catch {
        // The next save will surface any problem.
      }
    }
  });

  return {
    save,
    loadLatest,
    keepMine,
    /** Saves pending changes before leaving the dashboard. Resolves false if they couldn't be saved. */
    flush,
    announceDelete: (id) => channel?.postMessage({ type: 'deleted', id }),
    isBusy: () => Boolean(inFlight) || Boolean(timer),
  };
}
