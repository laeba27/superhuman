const { launch } = require('./cdp.js');
const path = require('path'), fs = require('fs');
const { OUT, BASE } = require('./config.js');
const D = '0b6f3c2e-5a41-4d8e-9a10-3f2c1d7e8a01';
const LOGO = '4fad7a6c-9e85-4bc2-9e54-7d6a5b1c2e05', BAR = '7cd0ad9f-c1b8-4ef5-a187-a09d8e4f5b08';
let ok = 0, fail = 0;
const check = (name, cond, extra = '') => { cond ? ok++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra !== '' ? `  [${extra}]` : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const api = async (path, opts) => (await fetch(BASE + 'api' + path, opts)).json();
const serverLogoX = async () => (await api(`/dashboards/${D}`)).data.sections[0].elements.find((e) => e.id === LOGO).x;
const serverVersion = async () => (await api(`/dashboards/${D}`)).data.version;

function tools(page, errors, label) {
  page.on((m) => {
    if (m.method === 'Runtime.exceptionThrown') errors.push(`${label}: ${m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text}`);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(`${label}: ${m.params.args.map((a) => a.value ?? a.description).join(' ')}`);
    if (m.method === 'Page.javascriptDialogOpening') page.s('Page.handleJavaScriptDialog', { accept: true });
  });
  const ev = async (expr) => {
    const r = await page.s('Runtime.evaluate', { expression: `(async () => { ${expr} })()`, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  };
  const waitFor = async (expr, ms = 6000) => { const end = Date.now() + ms; while (Date.now() < end) { try { if (await ev(`return Boolean(${expr})`)) return true; } catch {} await sleep(100); } return false; };
  const mouse = (type, x, y) => page.s('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1 });
  const clickAt = async (p) => { await mouse('mousePressed', p.x, p.y); await mouse('mouseReleased', p.x, p.y); await sleep(60); };
  const click = async (sel) => clickAt(await ev(`const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }`));
  const clickText = async (sel, text) => clickAt(await ev(`const n = [...document.querySelectorAll(${JSON.stringify(sel)})].find(n => n.textContent.trim().startsWith(${JSON.stringify(text)})); n.scrollIntoView({ block: 'center' }); const r = n.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }`));
  const key = async (k, code, vk, modifiers = 0) => { await page.s('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, modifiers, windowsVirtualKeyCode: vk }); await page.s('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, modifiers }); await sleep(30); };
  const nudge = () => key('ArrowRight', 'ArrowRight', 39);
  const status = () => ev(`return document.querySelector('.save-status').textContent`);
  const logoX = () => ev(`return parseInt(document.querySelector('[data-id="${LOGO}"]').style.left)`);
  const open = async (url = BASE) => { await page.s('Page.navigate', { url }); return waitFor(`document.querySelectorAll('.canvas .element').length >= 4 && window.Chart && document.querySelector('.save-status').textContent === 'Saved'`); };
  return { ev, waitFor, click, clickAt, clickText, key, nudge, status, logoX, open };
}

(async () => {
  const b = await launch({ profile: path.join(OUT, 'chrome-e2e6') });
  const errors = [];
  const A = tools(b, errors, 'A');

  // Count and control PUT requests in tab A.
  let puts = 0;
  let intercept = null; // async (params) => void, must continue/fail/fulfill the request
  b.on((m) => {
    if (m.method === 'Network.requestWillBeSent' && m.params.request.method === 'PUT') puts++;
    if (m.method === 'Fetch.requestPaused') {
      if (m.params.request.method === 'PUT' && intercept) intercept(m.params);
      else b.s('Fetch.continueRequest', { requestId: m.params.requestId });
    }
  });
  await b.s('Network.enable');
  await b.s('Fetch.enable', { patterns: [{ urlPattern: '*/api/dashboards/*', requestStage: 'Request' }] });

  check('tab A loads', await A.open());
  await A.click(`[data-id="${LOGO}"]`);

  // ---- Autosave + debounce
  puts = 0;
  for (let i = 0; i < 5; i++) { await A.nudge(); await sleep(200); }
  check('edits show "Unsaved changes" first', (await A.status()) === 'Unsaved changes');
  check('autosaves without pressing Save', await A.waitFor(`document.querySelector('.save-status').textContent === 'Saved'`, 5000));
  check('five quick edits -> one request', puts === 1, puts);
  check('server has the edit', (await serverLogoX()) === 29, await serverLogoX());

  // ---- Edit during an in-flight save -> saved afterwards
  let release;
  intercept = (p) => { release = () => b.s('Fetch.continueRequest', { requestId: p.requestId }); };
  await A.nudge();
  check('save in progress shows "Saving…"', await A.waitFor(`document.querySelector('.save-status').textContent === 'Saving…'`, 4000));
  await A.nudge(); await A.nudge();
  intercept = null;
  release();
  check('edits made during a save are saved after it', await A.waitFor(`document.querySelector('.save-status').textContent === 'Saved'`, 6000) && (await serverLogoX()) === 32, await serverLogoX());

  // ---- Network failure -> retry with countdown, then success
  let failures = 0;
  intercept = (p) => { failures++; b.s('Fetch.failRequest', { requestId: p.requestId, errorReason: 'InternetDisconnected' }); };
  await A.nudge();
  check('offline: status shows countdown + Retry now', await A.waitFor(`/Offline · retrying in \\d+s/.test(document.querySelector('.save-status').textContent) && document.querySelector('.save-status').textContent.includes('Retry now')`, 4000), await A.status());
  check('retries on its own (2s, then 5s)', await A.waitFor(`false`, 2600) || failures >= 2, failures);
  check('autosave paused while retrying (no extra requests from edits)', await (async () => { const f = failures; await A.nudge(); await sleep(400); return failures === f; })());
  intercept = null;
  await A.click('.save-status');
  check('"Retry now" saves once the connection is back', await A.waitFor(`document.querySelector('.save-status').textContent === 'Saved'`, 4000) && (await serverLogoX()) === 34, await serverLogoX());

  // ---- Server error 500 -> retrying; 422 -> error, no auto retry
  intercept = (p) => b.s('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: 500, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }], body: Buffer.from(JSON.stringify({ error: { message: 'Something went wrong on the server.' } })).toString('base64') });
  await A.nudge();
  check('HTTP 500 -> retrying', await A.waitFor(`document.querySelector('.save-status').textContent.startsWith('Offline · retrying')`, 4000));
  let fake422 = 0;
  intercept = (p) => { fake422++; b.s('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: 422, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }], body: Buffer.from(JSON.stringify({ error: { message: 'Some fields are invalid.', errors: [{ field: 'sections[0].x', message: 'must be a number' }] } })).toString('base64') }); };
  await A.click('.save-status');
  check('HTTP 422 -> "Couldn’t save · Retry" + toast with field', await A.waitFor(`document.querySelector('.save-status').textContent === 'Couldn’t saveRetry' && [...document.querySelectorAll('.toast.is-error')].some(t => t.textContent.includes('sections[0].x must be a number'))`, 4000), await A.status());
  await sleep(2500);
  check('422 is not retried automatically', fake422 === 1, fake422);
  intercept = null;
  await A.click('.save-status');
  check('manual Retry after 422 saves', await A.waitFor(`document.querySelector('.save-status').textContent === 'Saved'`, 4000));

  // ---- Second tab: auto refresh when clean
  const pB = await b.newPage();
  const B = tools(pB, errors, 'B');
  check('tab B loads', await B.open());
  const vBefore = await A.ev(`return document.querySelector('[data-id="${LOGO}"]').style.left`);
  await B.click(`[data-id="${LOGO}"]`);
  await B.nudge();
  check('tab B autosaves', await B.waitFor(`document.querySelector('.save-status').textContent === 'Saved'`, 5000) && await B.waitFor(`document.querySelector('.save-status').textContent === 'Saved'`, 100));
  check('clean tab A refreshes itself from tab B', await A.waitFor(`document.querySelector('[data-id="${LOGO}"]').style.left !== '${vBefore}' && [...document.querySelectorAll('.toast')].some(t => t.textContent.includes('another tab'))`, 4000), `${vBefore} -> ${await A.ev(`return document.querySelector('[data-id="${LOGO}"]').style.left`)}`);
  check('tab A kept its selection after refresh', await A.ev(`return document.querySelector('.canvas .is-selected')?.dataset.id === '${LOGO}'`));

  // ---- Conflict: A has unsaved edits while B saves -> dialog in A
  let holdA;
  intercept = (p) => { holdA = p.requestId; }; // hold A's save until B has saved
  await A.nudge(); // A: dirty
  await A.waitFor(`document.querySelector('.save-status').textContent === 'Saving…'`, 4000);
  await B.key('ArrowDown', 'ArrowDown', 40); // B moves the logo down
  await B.waitFor(`document.querySelector('.save-status').textContent === 'Saved'`, 5000);
  intercept = null;
  await b.s('Fetch.continueRequest', { requestId: holdA });
  check('conflict dialog opens in tab A', await A.waitFor(`document.querySelector('dialog.dialog')?.open && document.querySelector('dialog.dialog').textContent.includes('version')`, 4000));
  check('status shows "Changed elsewhere · Resolve", autosave paused', (await A.status()) === 'Changed elsewhereResolve');
  await A.key('Escape', 'Escape', 27);
  check('Escape closes dialog, conflict stays, selection kept', await A.ev(`return !document.querySelector('dialog.dialog').open && document.querySelector('.canvas .is-selected')?.dataset.id === '${LOGO}'`) && (await A.status()) === 'Changed elsewhereResolve');
  await A.click('.save-status');
  check('status reopens the dialog', await A.waitFor(`document.querySelector('dialog.dialog').open`));
  const aX = await A.logoX();
  await A.clickText('.dialog-actions .btn', 'Keep my version');
  check('"Keep my version" overwrites the server copy', await A.waitFor(`document.querySelector('.save-status').textContent === 'Saved'`, 4000) && (await serverLogoX()) === aX, `${await serverLogoX()} vs ${aX}`);
  check('tab B picks up A’s version (clean tab refresh)', await B.waitFor(`parseInt(document.querySelector('[data-id="${LOGO}"]').style.left) === ${aX}`, 4000));

  // Conflict again, this time load the latest
  holdA = null;
  intercept = (p) => { holdA = p.requestId; };
  await A.nudge();
  await A.waitFor(`document.querySelector('.save-status').textContent === 'Saving…'`, 4000);
  await B.click(`[data-id="${BAR}"]`);
  await B.key('ArrowLeft', 'ArrowLeft', 37);
  await B.waitFor(`document.querySelector('.save-status').textContent === 'Saved'`, 5000);
  intercept = null;
  await b.s('Fetch.continueRequest', { requestId: holdA });
  await A.waitFor(`document.querySelector('dialog.dialog').open`, 4000);
  const serverNow = await serverLogoX();
  await A.clickText('.dialog-actions .btn', 'Load latest version');
  check('"Load latest version" shows the server copy', await A.waitFor(`parseInt(document.querySelector('[data-id="${LOGO}"]').style.left) === ${serverNow} && document.querySelector('.save-status').textContent === 'Saved'`, 4000), `${await A.logoX()} vs ${serverNow}`);
  check('…including B’s other edit', await A.ev(`return document.querySelector('[data-id="${BAR}"]').style.left`) === await B.ev(`return document.querySelector('[data-id="${BAR}"]').style.left`));

  // ---- Switching dashboards saves first (no confirm)
  const second = (await api('/dashboards', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Second board' }) })).data.id;
  await A.open(BASE + '?d=' + D);
  await A.click(`[data-id="${LOGO}"]`);
  intercept = null;
  const before = await serverLogoX();
  await A.nudge();
  await A.click('.chip');
  await A.clickText('.menu-item', 'Second board');
  check('switching flushes the pending change', await A.waitFor(`document.querySelector('.chip-label').textContent === 'Second board'`, 5000) && (await serverLogoX()) === before + 1, `${before} -> ${await serverLogoX()}`);

  // ---- Deleted in another tab
  await B.open(BASE + '?d=' + second);
  await A.click('.chip');
  await A.clickText('.menu-item', 'Delete this dashboard');
  check('tab B is told and moves to another dashboard', await B.waitFor(`document.querySelector('.chip-label').textContent === 'Sales Overview' && [...document.querySelectorAll('.toast')].some(t => t.textContent.includes('deleted in another tab'))`, 5000), await B.ev(`return document.querySelector('.chip-label').textContent`));

  await A.waitFor(`document.querySelector('[data-id="${LOGO}"]')`, 5000); // A is still opening the remaining dashboard
  await A.click(`[data-id="${LOGO}"]`);
  intercept = (p) => b.s('Fetch.failRequest', { requestId: p.requestId, errorReason: 'InternetDisconnected' });
  await A.nudge();
  await A.waitFor(`document.querySelector('.save-status').textContent.startsWith('Offline')`, 4000);
  await b.s('Page.captureScreenshot', { format: 'png' }).then((r) => fs.writeFileSync(path.join(OUT, 'shot-phase6-offline.png'), Buffer.from(r.data, 'base64')));
  intercept = null;

  const real = errors.filter((e) => !/Failed to load resource|net::ERR_INTERNET_DISCONNECTED/.test(e));
  check('no JS errors', real.length === 0, real.join(' | '));
  console.log(`\n${ok} passed, ${fail} failed`);
  b.close(); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
