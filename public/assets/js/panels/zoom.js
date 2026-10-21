import { clamp, h, icon } from '../utils.js';

const STEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.25, 1.5, 2];
const MIN = STEPS[0];
const MAX = STEPS[STEPS.length - 1];

export function createZoom(root, store, canvas, viewport) {
  const set = (zoom) => store.dispatch({ type: 'ui/zoom', zoom });

  const zoomIn = () => set(STEPS.find((s) => s > canvas.getScale() + 0.001) ?? MAX);
  const zoomOut = () => set([...STEPS].reverse().find((s) => s < canvas.getScale() - 0.001) ?? MIN);
  const fit = () => set('fit');

  const out = h('button', { class: 'icon-btn zoom-btn', type: 'button', title: 'Zoom out (Ctrl −)', 'aria-label': 'Zoom out', onClick: zoomOut }, icon('minus'));
  const label = h('button', { class: 'zoom-label', type: 'button', title: 'Fit to screen (Ctrl 0)', onClick: fit });
  const inn = h('button', { class: 'icon-btn zoom-btn', type: 'button', title: 'Zoom in (Ctrl +)', 'aria-label': 'Zoom in', onClick: zoomIn }, icon('plus'));
  root.append(out, label, inn);

  function sync({ scale, flowing }) {
    const { mode, zoom, dashboard } = store.getState();
    const disabled = mode !== 'edit' || flowing || !dashboard;
    root.hidden = mode !== 'edit';
    label.textContent = `${Math.round(scale * 100)}%${zoom === 'fit' ? ' · Fit' : ''}`;
    label.setAttribute('aria-label', `Zoom ${Math.round(scale * 100)}%, click to fit`);
    out.disabled = disabled || scale <= MIN + 0.001;
    inn.disabled = disabled || scale >= MAX - 0.001;
    label.disabled = disabled || zoom === 'fit';
  }
  canvas.onLayout(sync);
  store.subscribe((state, prev) => {
    if (state.mode !== prev.mode) sync({ scale: canvas.getScale(), flowing: false });
  });

  viewport.addEventListener('wheel', (event) => {
    if (!event.ctrlKey || store.getState().mode !== 'edit') return;
    event.preventDefault();
    set(clamp(Math.round(canvas.getScale() * Math.exp(-event.deltaY * 0.01) * 100) / 100, MIN, MAX));
  }, { passive: false });

  return { zoomIn, zoomOut, fit };
}
