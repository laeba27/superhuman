const { launch } = require('./cdp.js');
const path = require('path'), fs = require('fs');
const { OUT, BASE } = require('./config.js');
let ok = 0, fail = 0;
const check = (name, cond, extra = '') => { cond ? ok++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra !== '' ? `  [${extra}]` : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const HEADER = '1c7a4d3f-6b52-4e9f-8b21-4a3d2e8f9b02', SALES = '2d8b5e4a-7c63-4fa0-9c32-5b4e3f9a0c03', REGION = '3e9c6f5b-8d74-4ab1-8d43-6c5f4a0b1d04';
const BAR = '7cd0ad9f-c1b8-4ef5-a187-a09d8e4f5b08', LOGO = '4fad7a6c-9e85-4bc2-9e54-7d6a5b1c2e05';

(async () => {
  const b = await launch({ profile: path.join(OUT, 'chrome-e2e') });
  const errors = [];
  b.on((m) => {
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map((a) => a.value ?? a.description).join(' '));
    if (m.method === 'Page.javascriptDialogOpening') b.s('Page.handleJavaScriptDialog', { accept: true });
  });
  const ev = async (expr) => {
    const r = await b.s('Runtime.evaluate', { expression: `(async () => { ${expr} })()`, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  };
  const waitFor = async (expr, ms = 5000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await ev(`return Boolean(${expr})`)) return true; await sleep(100); } return false; };
  // canvas coords -> screen coords
  const screen = (cx, cy) => ev(`const r = document.getElementById('canvas').getBoundingClientRect(); const s = r.width / ${1200}; return { x: r.left + ${cx} * s, y: r.top + ${cy} * s, s };`);
  const mouse = (type, x, y, modifiers = 0) => b.s('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' ? 'left' : 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, modifiers });
  const drag = async (from, to, { modifiers = 0, steps = 8, beforeRelease } = {}) => {
    await mouse('mousePressed', from.x, from.y, modifiers);
    for (let i = 1; i <= steps; i++) { await mouse('mouseMoved', from.x + (to.x - from.x) * i / steps, from.y + (to.y - from.y) * i / steps, modifiers); await sleep(16); }
    if (beforeRelease) await beforeRelease();
    await mouse('mouseReleased', to.x, to.y, modifiers);
    await sleep(50);
  };
  const click = async (p) => { await mouse('mousePressed', p.x, p.y); await mouse('mouseReleased', p.x, p.y); await sleep(30); };
  const style = (id, prop) => ev(`return document.querySelector('[data-id="${id}"]').style.${prop}`);
  const parentSection = (id) => ev(`return document.querySelector('[data-id="${id}"]').closest('.section').dataset.id`);
  const key = async (k, code, vk, modifiers = 0) => { await b.s('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, modifiers, windowsVirtualKeyCode: vk }); await b.s('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, modifiers }); };
  const undo = () => key('z', 'KeyZ', 90, 4);

  await b.s('Page.navigate', { url: BASE });
  await ev(`localStorage.setItem('dashboard-builder:propertiesTab', '"style"')`);
  check('loads with interact.js', await waitFor(`window.interact && document.querySelectorAll('.element').length === 4`));
  const scale = (await screen(0, 0)).s;
  check('handles exist on items', await ev(`return document.querySelectorAll('.handle-section').length === 24 && document.querySelectorAll('.handle-element').length === 32`));

  // A. drag section with snap
  await drag(await screen(802, 360), await screen(802, 510));
  check('drag section snaps to grid (160+150 -> 312)', await style(REGION, 'top') === '312px', await style(REGION, 'top'));
  check('dragged section is selected + handles visible', await ev(`const n = document.querySelector('[data-id="${REGION}"]'); return n.classList.contains('is-selected') && getComputedStyle(n.querySelector(':scope > .handles')).display === 'block'`));
  check('properties panel follows drag', await ev(`return document.querySelectorAll('.properties .field-grid input')[1].value === '312'`));
  await undo();
  check('one undo reverts whole drag', await style(REGION, 'top') === '160px', await style(REGION, 'top'));

  // B. Alt disables snapping
  await drag(await screen(802, 360), await screen(802, 510), { modifiers: 1 });
  check('Alt-drag skips grid (310)', await style(REGION, 'top') === '310px', await style(REGION, 'top'));
  await undo();

  // C. drag section beyond canvas right edge clamps
  await drag(await screen(802, 360), await screen(1400, 360));
  check('section clamps at canvas edge (1200-384=816)', await style(REGION, 'left') === '816px', await style(REGION, 'left'));
  await undo();

  // D. drag bar chart from region section into sales section
  let sawTarget = false;
  await drag(await screen(984, 344), await screen(404, 300), { beforeRelease: async () => { sawTarget = await ev(`return document.querySelector('[data-id="${SALES}"]').classList.contains('is-drop-target')`); } });
  check('drop target highlighted during drag', sawTarget);
  check('element moved into the other section', await parentSection(BAR) === SALES, await parentSection(BAR));
  check('position snapped & relative to new section (208, 0)', await style(BAR, 'left') === '208px' && await style(BAR, 'top') === '0px', `${await style(BAR, 'left')},${await style(BAR, 'top')}`);
  check('drag styles cleaned up', await ev(`return !document.querySelector('.is-dragging, .is-drag-source, .is-drop-target') && document.querySelector('[data-id="${BAR}"]').style.transform === ''`));
  check('chart still alive after DOM move', await ev(`return Object.keys(Chart.instances).length === 2`));
  await undo();
  check('undo puts element back in its section', await parentSection(BAR) === REGION && await style(BAR, 'left') === '20px');
  await key('z', 'KeyZ', 90, 4 | 8);
  check('redo moves it again', await parentSection(BAR) === SALES);

  // E. resize element by its se handle
  const se = await ev(`const r = document.querySelector('[data-id="${BAR}"] > .handles .handle-se').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }`);
  await drag(se, { x: se.x + 104 * scale, y: se.y + 104 * scale });
  check('resize element: right edge snaps (w 448), h clamped to section 368', await style(BAR, 'width') === '448px' && await style(BAR, 'height') === '368px', `${await style(BAR, 'width')} x ${await style(BAR, 'height')}`);
  await sleep(300);
  check('chart redraws at new size', await ev(`const c = Object.values(Chart.instances).find(c => c.config.type === 'bar'); return Math.abs(c.width - 440) <= 2`), await ev(`return Object.values(Chart.instances).find(c => c.config.type === 'bar').width`));

  // F. select sales section and resize its west edge past the canvas edge
  await click(await screen(34, 520));
  check('click empty section area selects section', await ev(`return document.querySelector('[data-id="${SALES}"]').classList.contains('is-selected')`));
  const w = await ev(`const r = document.querySelector('[data-id="${SALES}"] > .handles .handle-w').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }`);
  await drag(w, { x: w.x - 60 * scale, y: w.y });
  check('west-edge resize clamps at 0 and keeps right edge (x0 w768)', await style(SALES, 'left') === '0px' && await style(SALES, 'width') === '768px', `${await style(SALES, 'left')} w ${await style(SALES, 'width')}`);
  // shrink section from the east: elements get pulled inside
  const e = await ev(`const r = document.querySelector('[data-id="${SALES}"] > .handles .handle-e').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }`);
  await drag(e, { x: e.x - 400 * scale, y: e.y });
  check('shrinking section refits its elements', await ev(`const s = document.querySelector('[data-id="${SALES}"]'); const sw = parseInt(s.style.width); return sw === 368 && [...s.querySelectorAll('.element')].every(el => parseInt(el.style.left) + parseInt(el.style.width) <= sw)`),
    await ev(`const s = document.querySelector('[data-id="${SALES}"]'); return s.style.width + ' ' + [...s.querySelectorAll('.element')].map(el => el.style.left + '+' + el.style.width).join(' ')`));
  await undo();
  check('undo restores section width', await style(SALES, 'width') === '768px');

  // G. arrow nudges
  await click(await screen(24 + 24 + 36, 24 + 20 + 36));
  check('logo selected', await ev(`return document.querySelector('[data-id="${LOGO}"]').classList.contains('is-selected')`));
  for (let i = 0; i < 3; i++) await key('ArrowRight', 'ArrowRight', 39);
  await key('ArrowDown', 'ArrowDown', 40, 8);
  check('arrows nudge 1px, Shift+arrow nudges a grid step', await style(LOGO, 'left') === '27px' && await style(LOGO, 'top') === '28px', `${await style(LOGO, 'left')},${await style(LOGO, 'top')}`);
  await undo();
  check('a run of nudges is one undo step', await style(LOGO, 'left') === '24px' && await style(LOGO, 'top') === '20px', `${await style(LOGO, 'left')},${await style(LOGO, 'top')}`);

  // H. store unit checks: move growth + ordering
  const unit = await ev(`
    const { createStore } = await import('./assets/js/store.js');
    const st = createStore();
    const el = (id, x, y) => ({ id, type: 'text', x, y, width: 100, height: 50, zIndex: 1, content: { html: '' } });
    st.dispatch({ type: 'dashboard/loaded', dashboard: { id: 'd', name: 'x', version: 1, canvasWidth: 1200, settings: { gridSize: 8, snapToGrid: true },
      sections: [{ id: 's1', x: 0, y: 0, width: 400, height: 200, zIndex: 1, style: {}, elements: [el('a', 0, 0), el('b', 120, 0), el('c', 240, 0)] },
                 { id: 's2', x: 0, y: 300, width: 300, height: 100, zIndex: 1, style: {}, elements: [] }] } });
    st.dispatch({ type: 'element/move', id: 'a', sectionId: 's1', x: 10, y: 400 });
    const s1 = st.getState().dashboard.sections[0];
    const r1 = s1.height === 450 && s1.elements.map(e => e.id).join() === 'a,b,c' && s1.elements[0].y === 400;
    st.dispatch({ type: 'element/move', id: 'b', sectionId: 's2', x: 280, y: 10 });
    const s2 = st.getState().dashboard.sections[1];
    const r2 = s2.elements[0].id === 'b' && s2.elements[0].x === 200 && st.getState().dashboard.sections[0].elements.length === 2;
    const before = st.getState();
    st.dispatch({ type: 'element/move', id: 'b', sectionId: 's2', x: 200, y: 10 });
    const r3 = st.getState() === before;
    return { r1, r2, r3 };`);
  check('store: move below bottom grows section, keeps order', unit.r1);
  check('store: move to other section clamps x into it', unit.r2);
  check('store: no-op move changes nothing', unit.r3);

  // I. preview: dragging does nothing
  await ev(`document.querySelector('[aria-label="Preview"]').click()`);
  await sleep(200);
  const pv = await ev(`const r = document.querySelector('[data-id="${REGION}"]').getBoundingClientRect(); return { x: r.left + 10, y: r.top + r.height - 10 }`);
  await drag(pv, { x: pv.x, y: pv.y + 100 });
  check('preview mode: no dragging', await style(REGION, 'top') === '160px', await style(REGION, 'top'));
  await ev(`document.querySelector('[aria-label="Back to editing"]').click()`);

  // J. save + reload
  await key('s', 'KeyS', 83, 4);
  check('saved', await waitFor(`document.querySelector('.save-status').textContent === 'Saved'`));
  await b.s('Page.reload'); await sleep(300);
  check('after reload: chart lives in sales section with new size', await waitFor(`document.querySelectorAll('.element').length === 4`) && await parentSection(BAR) === SALES && await style(BAR, 'width') === '448px' && await style(SALES, 'left') === '0px');

  // screenshot mid-selection
  await click(await screen(300, 300));
  await sleep(400);
  await b.s('Page.captureScreenshot', { format: 'png' }).then((r) => fs.writeFileSync(path.join(OUT, 'shot-phase3.png'), Buffer.from(r.data, 'base64')));
  check('no JS errors', errors.length === 0, errors.join(' | '));
  console.log(`\n${ok} passed, ${fail} failed`);
  b.close(); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
