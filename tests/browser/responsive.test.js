const { launch } = require('./cdp.js');
const path = require('path'), fs = require('fs');
const { OUT, BASE } = require('./config.js');
const D = '0b6f3c2e-5a41-4d8e-9a10-3f2c1d7e8a01';
const HEADER = '1c7a4d3f-6b52-4e9f-8b21-4a3d2e8f9b02', SALES = '2d8b5e4a-7c63-4fa0-9c32-5b4e3f9a0c03', REGION = '3e9c6f5b-8d74-4ab1-8d43-6c5f4a0b1d04';
const TEXT = '5abe8b7d-af96-4cd3-8f65-8e7b6c2d3f06';
let ok = 0, fail = 0;
const check = (name, cond, extra = '') => { cond ? ok++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra !== '' ? `  [${extra}]` : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const b = await launch({ profile: path.join(OUT, 'chrome-e2e7') });
  const errors = [], dialogs = [];
  let puts = 0;
  b.on((m) => {
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map((a) => a.value ?? a.description).join(' '));
    if (m.method === 'Page.javascriptDialogOpening') { dialogs.push(m.params); b.s('Page.handleJavaScriptDialog', { accept: true }); }
    if (m.method === 'Network.requestWillBeSent' && m.params.request.method === 'PUT') puts++;
  });
  await b.s('Network.enable');
  const ev = async (expr) => {
    const r = await b.s('Runtime.evaluate', { expression: `(async () => { ${expr} })()`, awaitPromise: true, returnByValue: true, userGesture: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  };
  const waitFor = async (expr, ms = 6000) => { const end = Date.now() + ms; while (Date.now() < end) { try { if (await ev(`return Boolean(${expr})`)) return true; } catch {} await sleep(100); } return false; };
  const mouse = (type, x, y) => b.s('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1 });
  const clickAt = async (p) => { await mouse('mousePressed', p.x, p.y); await mouse('mouseReleased', p.x, p.y); await sleep(80); };
  const click = async (sel) => clickAt(await ev(`const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }`));
  const clickText = async (sel, text) => clickAt(await ev(`const n = [...document.querySelectorAll(${JSON.stringify(sel)})].find(n => n.textContent.trim().startsWith(${JSON.stringify(text)})); n.scrollIntoView({ block: 'center' }); const r = n.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }`));
  const key = async (k, code, vk, modifiers = 0) => { await b.s('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, modifiers, windowsVirtualKeyCode: vk }); await b.s('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, modifiers }); await sleep(60); };
  const zoomLabel = () => ev(`return document.querySelector('.zoom-label').textContent`);
  const canvasWidth = () => ev(`return Math.round(document.getElementById('canvas').getBoundingClientRect().width)`);
  const boxes = () => ev(`return [...document.querySelectorAll('.canvas [data-id]')].map(n => n.dataset.id + ':' + n.style.left + ',' + n.style.top + ',' + n.style.width + ',' + n.style.height).join('|')`);
  const META = 4;

  await b.s('Page.navigate', { url: BASE });
  check('loads', await waitFor(`document.querySelectorAll('.canvas .element').length === 4 && window.Chart && document.querySelector('.save-status').textContent === 'Saved'`));
  check('tab title shows dashboard name', await ev(`return document.title === 'Sales Overview · Dashboard Builder'`));
  const desktopBoxes = await boxes();

  // ---- Zoom
  const fit = await ev(`return parseInt(document.querySelector('.zoom-label').textContent)`);
  check('zoom starts at Fit', (await zoomLabel()).endsWith('· Fit') && Math.abs(await canvasWidth() - 1200 * fit / 100) <= 6, `${await zoomLabel()} ${await canvasWidth()}`);
  await click('[aria-label="Zoom in"]');
  check('+ goes to the next step', (await zoomLabel()) === '67%', await zoomLabel());
  await key('=', 'Equal', 187, META); await key('=', 'Equal', 187, META);
  check('⌘= zooms in (100%), canvas 1200px wide', (await zoomLabel()) === '100%' && (await canvasWidth()) === 1200, `${await zoomLabel()} ${await canvasWidth()}`);
  check('wider than the view: scrolls sideways', await ev(`const v = document.getElementById('viewport'); return v.scrollWidth > v.clientWidth`));
  // drag still lands correctly at 100%
  const before = await ev(`return parseInt(document.querySelector('[data-id="${REGION}"]').style.top)`);
  const p = await ev(`const r = document.querySelector('[data-id="${REGION}"]').getBoundingClientRect(); return { x: r.left + 12, y: r.bottom - 12 }`);
  await mouse('mousePressed', p.x, p.y);
  for (let i = 1; i <= 8; i++) { await mouse('mouseMoved', p.x, p.y + i * 10); await sleep(16); }
  await mouse('mouseReleased', p.x, p.y + 80); await sleep(80);
  check('drag at 100% moves 80 canvas px', (await ev(`return parseInt(document.querySelector('[data-id="${REGION}"]').style.top)`)) === before + 80);
  await key('z', 'KeyZ', 90, META);
  await key('-', 'Minus', 189, META);
  check('⌘− zooms out', (await zoomLabel()) === '75%', await zoomLabel());
  await ev(`document.getElementById('viewport').dispatchEvent(new WheelEvent('wheel', { deltaY: -60, ctrlKey: true, bubbles: true, cancelable: true, clientX: 600, clientY: 400 }))`);
  check('Ctrl+scroll zooms in smoothly', parseInt(await zoomLabel()) > 75, await zoomLabel());
  await key('0', 'Digit0', 48, META);
  check('⌘0 fits again', (await zoomLabel()).endsWith('· Fit'));
  check('zoom label disabled at Fit', await ev(`return document.querySelector('.zoom-label').disabled`));

  // ---- Shortcuts sheet
  await click('.canvas-viewport');
  await key('?', 'Slash', 191, 8);
  check('"?" opens the shortcuts sheet', await waitFor(`document.querySelector('.shortcuts-dialog').open && document.querySelector('.shortcuts-dialog').textContent.includes('Duplicate')`));
  await key('Escape', 'Escape', 27);
  check('Escape closes it', await ev(`return !document.querySelector('.shortcuts-dialog').open`));
  await click('.rail [aria-label="Keyboard shortcuts"]');
  check('rail help button opens it', await waitFor(`document.querySelector('.shortcuts-dialog').open`));
  await clickText('.shortcuts-dialog .btn', 'Close');

  // ---- Empty hint
  const fresh = (await (await fetch(BASE + 'api/dashboards', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Blank' }) })).json()).data.id;
  await b.s('Page.navigate', { url: `${BASE}?d=${fresh}` });
  check('empty dashboard shows a hint', await waitFor(`document.querySelector('.chip-label').textContent === 'Blank' && !document.querySelector('.empty-hint').hidden`));
  await clickText('.tile-name', 'Section');
  check('hint goes away once there is content', await ev(`return document.querySelector('.empty-hint').hidden`));
  await key('z', 'KeyZ', 90, META);
  await sleep(1800);

  // ---- Copy preview link
  await b.s('Browser.grantPermissions', { origin: new URL(BASE).origin, permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] }).catch(() => {});
  await b.s('Page.navigate', { url: `${BASE}?d=${D}` });
  await waitFor(`document.querySelectorAll('.canvas .element').length === 4`);
  await click('.chip');
  await clickText('.menu-item', 'Copy preview link');
  await sleep(300);
  const link = await ev(`try { return await navigator.clipboard.readText(); } catch { return null; }`) ?? dialogs.find((d) => d.type === 'prompt')?.defaultPrompt;
  check('preview link copied', typeof link === 'string' && link.includes(`d=${D}`) && link.includes('view=preview'), link);
  await b.s('Page.navigate', { url: link });
  check('preview link opens in preview mode', await waitFor(`document.body.dataset.mode === 'preview' && document.querySelectorAll('.canvas .element').length === 4`));
  check('preview hides editor chrome and status bar', await ev(`return getComputedStyle(document.querySelector('.rail')).display === 'none' && getComputedStyle(document.querySelector('.statusbar')).display === 'none'`));

  // ---- Mobile flow in preview (desktop browser, Mobile width)
  await click('[aria-label="Mobile width"]');
  check('mobile preview uses the one-column flow', await waitFor(`document.getElementById('canvas').classList.contains('is-flow')`));
  const flow = await ev(`
    const secs = [...document.querySelectorAll('.canvas .section')].map(n => ({ id: n.dataset.id, x: parseInt(n.style.left), y: parseInt(n.style.top), w: parseInt(n.style.width), h: parseInt(n.style.height) })).sort((a, b) => a.y - b.y);
    const els = [...document.querySelectorAll('.canvas .element')].map(n => ({ x: parseInt(n.style.left), w: parseInt(n.style.width) }));
    return { secs, els, order: secs.map(s => s.id), canvas: Math.round(document.getElementById('canvas').getBoundingClientRect().width) };`);
  check('canvas is 390px, not scaled', flow.canvas === 390, flow.canvas);
  check('sections full width and stacked without overlap', flow.secs.every((s) => s.x === 12 && s.w === 366) && flow.secs.every((s, i) => i === 0 || s.y >= flow.secs[i - 1].y + flow.secs[i - 1].h), JSON.stringify(flow.secs));
  check('reading order: header, then left section, then right section', flow.order.join() === [HEADER, SALES, REGION].join());
  check('elements left-aligned; text/charts full width; logo keeps its 72px size', flow.els.every((e) => e.x === 12) && flow.els.filter((e) => e.w === 342).length === 3 && flow.els.some((e) => e.w === 72), JSON.stringify(flow.els));
  check('logo comes before the heading beside it', await ev(`const logo = document.querySelector('[data-id="4fad7a6c-9e85-4bc2-9e54-7d6a5b1c2e05"]'); const text = document.querySelector('[data-id="${TEXT}"]'); return parseInt(logo.style.top) < parseInt(text.style.top) && parseInt(logo.style.height) === 72`));
  check('text keeps its real size (28px heading)', await ev(`return getComputedStyle(document.querySelector('[data-id="${TEXT}"] h1')).fontSize === '28px'`));
  check('text box fits its words', await ev(`const n = document.querySelector('[data-id="${TEXT}"]'); const b = n.querySelector('.text-body'); return b.scrollHeight <= parseInt(n.style.height) + 1`));
  check('charts redraw at the narrow width', await waitFor(`Object.values(Chart.instances).every(c => Math.abs(c.width - 334) <= 2)`), await ev(`return Object.values(Chart.instances).map(c => c.width).join()`));
  check('no sideways scrolling', await ev(`const v = document.getElementById('viewport'); return v.scrollWidth <= v.clientWidth`));
  await b.s('Page.captureScreenshot', { format: 'png' }).then((r) => fs.writeFileSync(path.join(OUT, 'shot-phase7-mobile-frame.png'), Buffer.from(r.data, 'base64')));

  await click('[aria-label="Tablet width"]');
  check('tablet preview stays a scaled canvas', await waitFor(`!document.getElementById('canvas').classList.contains('is-flow') && Math.round(document.getElementById('canvas').getBoundingClientRect().width) === 768`));
  puts = 0;
  await click('[aria-label="Desktop width"]');
  await click('[aria-label="Back to editing"]');
  await sleep(1800);
  check('back to editing: saved layout untouched, nothing to save', (await boxes()) === desktopBoxes && puts === 0 && (await ev(`return document.querySelector('.save-status').textContent`)) === 'Saved');

  // ---- A real phone (390×844)
  await b.s('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await b.s('Emulation.setTouchEmulationEnabled', { enabled: true });
  await b.s('Page.navigate', { url: `${BASE}?d=${D}` });
  check('phone opens in preview with the flow', await waitFor(`document.body.dataset.mode === 'preview' && document.getElementById('canvas').classList.contains('is-flow') && document.querySelectorAll('.canvas .element').length === 4`));
  check('page does not scroll sideways', await ev(`return document.documentElement.scrollWidth <= 390 && document.getElementById('viewport').scrollWidth <= document.getElementById('viewport').clientWidth`));
  check('top bar fits the phone', await ev(`const t = document.querySelector('.topbar'); return t.scrollWidth <= t.clientWidth + 1`), await ev(`return document.querySelector('.topbar').scrollWidth`));
  await sleep(600);
  await b.s('Page.captureScreenshot', { format: 'png' }).then((r) => fs.writeFileSync(path.join(OUT, 'shot-phase7-phone.png'), Buffer.from(r.data, 'base64')));
  await ev(`document.querySelector('[aria-label="Back to editing"]').click()`);
  check('editing on a phone: hint, rail + canvas only', await waitFor(`[...document.querySelectorAll('.toast')].some(t => t.textContent.includes('larger screen'))`) && await ev(`return getComputedStyle(document.querySelector('.properties')).display === 'none' && getComputedStyle(document.querySelector('.rail')).display !== 'none'`));
  await b.s('Emulation.clearDeviceMetricsOverride');

  check('no JS errors', errors.length === 0, errors.join(' | '));
  console.log(`\n${ok} passed, ${fail} failed`);
  b.close(); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
