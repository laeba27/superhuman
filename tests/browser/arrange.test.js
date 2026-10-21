const { launch } = require('./cdp.js');
const path = require('path'), fs = require('fs');
const { OUT, BASE } = require('./config.js');
let ok = 0, fail = 0;
const check = (name, cond, extra = '') => { cond ? ok++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra !== '' ? `  [${extra}]` : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const HEADER = '1c7a4d3f-6b52-4e9f-8b21-4a3d2e8f9b02', SALES = '2d8b5e4a-7c63-4fa0-9c32-5b4e3f9a0c03', REGION = '3e9c6f5b-8d74-4ab1-8d43-6c5f4a0b1d04';
const LOGO = '4fad7a6c-9e85-4bc2-9e54-7d6a5b1c2e05', TEXT = '5abe8b7d-af96-4cd3-8f65-8e7b6c2d3f06', REV = '6bcf9c8e-b0a7-4de4-9076-9f8c7d3e4a07', BAR = '7cd0ad9f-c1b8-4ef5-a187-a09d8e4f5b08';
const META = 4, ALT = 1;

(async () => {
  const b = await launch({ profile: path.join(OUT, 'chrome-e2e5') });
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
  const waitFor = async (expr, ms = 5000) => { const end = Date.now() + ms; while (Date.now() < end) { try { if (await ev(`return Boolean(${expr})`)) return true; } catch {} await sleep(100); } return false; };
  const mouse = (type, x, y, button = 'left') => b.s('Input.dispatchMouseEvent', { type, x, y, button, buttons: type === 'mouseReleased' ? 0 : (button === 'right' ? 2 : 1), clickCount: 1 });
  const clickAt = async (p, button = 'left') => { await mouse('mousePressed', p.x, p.y, button); await mouse('mouseReleased', p.x, p.y, button); await sleep(60); };
  const centerOf = (sel) => ev(`const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }`);
  const click = async (sel, button) => clickAt(await centerOf(sel), button);
  const byText = (sel, text) => `[...document.querySelectorAll(${JSON.stringify(sel)})].find(n => n.textContent.trim().startsWith(${JSON.stringify(text)}))`;
  const clickText = async (sel, text) => clickAt(await ev(`const n = ${byText(sel, text)}; n.scrollIntoView({ block: 'center' }); const r = n.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }`));
  const key = async (k, code, vk, modifiers = 0) => { await b.s('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, modifiers, windowsVirtualKeyCode: vk }); await b.s('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, modifiers }); await sleep(40); };
  const count = (sel) => ev(`return document.querySelectorAll(${JSON.stringify(sel)}).length`);
  const box = (id) => ev(`const n = document.querySelector('[data-id="${id}"]'); return { x: parseInt(n.style.left), y: parseInt(n.style.top), w: parseInt(n.style.width), h: parseInt(n.style.height), z: parseInt(n.style.zIndex) }`);
  const selectedId = () => ev(`return document.querySelector('.canvas .is-selected')?.dataset.id ?? null`);
  const sectionOf = (id) => ev(`return document.querySelector('[data-id="${id}"]').closest('.section').dataset.id`);
  const pointIn = (ids) => ev(`
    const rects = ${JSON.stringify(ids)}.map(id => document.querySelector('[data-id="' + id + '"]').getBoundingClientRect());
    const l = Math.max(...rects.map(r => r.left)), t = Math.max(...rects.map(r => r.top)), r = Math.min(...rects.map(r => r.right)), b = Math.min(...rects.map(r => r.bottom));
    for (let y = t + 4; y < b - 4; y += 6) for (let x = l + 4; x < r - 4; x += 6) {
      const hit = document.elementFromPoint(x, y)?.closest('.element')?.dataset.id;
      if (${JSON.stringify(ids)}.includes(hit)) return { x, y };
    }
    return null;`);
  const topAt = (p) => ev(`return document.elementFromPoint(${p.x}, ${p.y}).closest('.element')?.dataset.id ?? null`);

  await b.s('Page.navigate', { url: BASE });
  await ev(`localStorage.setItem('dashboard-builder:propertiesTab', '"style"')`);
  await b.s('Page.reload');
  check('loads', await waitFor(`document.querySelectorAll('.element').length === 4 && window.Chart`));

  await click(`[data-id="${BAR}"]`);
  await key('d', 'KeyD', 68, META);
  const dup = await selectedId();
  check('Cmd+D duplicates element and selects the copy', dup && dup !== BAR && await sectionOf(dup) === REGION && await count('.element') === 5);
  const [orig, copy] = [await box(BAR), await box(dup)];
  check('copy offset by 16px (section grows to fit)', copy.x === Math.min(orig.x + 16, 384 - orig.w) && copy.y === orig.y + 16 && (await box(REGION)).h >= copy.y + copy.h, JSON.stringify({ orig, copy, region: await box(REGION) }));
  check('copy is a working chart with same data', await waitFor(`Chart.getChart(document.querySelector('[data-id="${dup}"] canvas'))?.data.labels.length === 5`));
  check('copy draws on top of original', await topAt({ x: (await centerOf(`[data-id="${dup}"]`)).x, y: (await centerOf(`[data-id="${dup}"]`)).y }) === dup);
  await key('z', 'KeyZ', 90, META);
  check('undo removes the copy', await count('.element') === 4 && !(await ev(`return Boolean(document.querySelector('[data-id="${dup}"]'))`)));

  await click(`[data-id="${SALES}"]`);
  await clickAt({ x: (await centerOf(`[data-id="${SALES}"]`)).x, y: (await ev(`return document.querySelector('[data-id="${SALES}"]').getBoundingClientRect().bottom - 6`)) });
  check('section selected', await selectedId() === SALES);
  const regionBefore = await box(REGION);
  await clickText('.props-actions .btn', 'Duplicate');
  const dupSec = await selectedId();
  check('duplicate section: new id, below original, elements cloned', dupSec && dupSec !== SALES && await count('.section') === 4 && await ev(`return document.querySelector('[data-id="${dupSec}"]').querySelectorAll('.element').length === 1`));
  const ds = await box(dupSec), so = await box(SALES);
  check('copy sits one gap below original', ds.y === so.y + so.h + 24 && ds.x === so.x, JSON.stringify({ ds, so }));
  check('section beside it (region) did not move', JSON.stringify(await box(REGION)) === JSON.stringify(regionBefore));
  check('all ids unique', await ev(`const ids = [...document.querySelectorAll('.canvas [data-id]')].map(n => n.dataset.id); return new Set(ids).size === ids.length`));
  check('cloned live chart is fetching on its own', await waitFor(`Chart.getChart(document.querySelector('[data-id="${dupSec}"] canvas'))?.data.labels.length === 20`, 6000));

  await click(`[data-id="${LOGO}"]`);
  await key('c', 'KeyC', 67, META);
  check('copy shows toast', await waitFor(`[...document.querySelectorAll('.toast')].some(t => t.textContent === 'Copied image.')`));
  await clickAt({ x: (await centerOf(`[data-id="${dupSec}"]`)).x, y: (await ev(`return document.querySelector('[data-id="${dupSec}"]').getBoundingClientRect().bottom - 6`)) });
  await key('v', 'KeyV', 86, META);
  const pasted = await selectedId();
  check('paste puts the copy in the selected section', pasted && await sectionOf(pasted) === dupSec && JSON.stringify(await box(pasted)).includes('"x":24,"y":20'), JSON.stringify(await box(pasted)));
  await key('v', 'KeyV', 86, META);
  const pasted2 = await selectedId();
  check('pasting again offsets so it does not cover the first', pasted2 !== pasted && (await box(pasted2)).x === 40 && (await box(pasted2)).y === 36, JSON.stringify(await box(pasted2)));
  await key('x', 'KeyX', 88, META);
  check('cut removes the element', !(await ev(`return Boolean(document.querySelector('[data-id="${pasted2}"]'))`)));
  await click(`[data-id="${REGION}"] .element`);
  await key('v', 'KeyV', 86, META);
  check('paste after cut lands in the selected element’s section', await sectionOf(await selectedId()) === REGION);

  await click(`[data-id="${HEADER}"]`);
  await clickAt({ x: (await centerOf(`[data-id="${HEADER}"]`)).x + 300, y: (await centerOf(`[data-id="${HEADER}"]`)).y });
  check('header section selected', await selectedId() === HEADER);
  await key('c', 'KeyC', 67, META);
  await key('v', 'KeyV', 86, META);
  const pastedSec = await selectedId();
  const hd = await box(HEADER);
  check('pasted section lands right below the selected one, others pushed down', pastedSec !== HEADER && (await box(pastedSec)).y === hd.y + hd.h + 24 && (await box(SALES)).y === hd.y + hd.h + 24 + hd.h + 24,
    JSON.stringify({ pasted: await box(pastedSec), sales: await box(SALES) }));

  await click(`[data-id="${BAR}"]`);
  await key('d', 'KeyD', 68, META);
  const top = await selectedId();
  const overlap = await pointIn([BAR, top]);
  check('copy on top at overlap point', await topAt(overlap) === top);
  await key('[', 'BracketLeft', 219, META);
  check('Cmd+[ sends backward', await topAt(overlap) === BAR);
  await key(']', 'BracketRight', 221, META);
  check('Cmd+] brings forward', await topAt(overlap) === top);
  await key('[', 'BracketLeft', 219, META | ALT);
  check('Cmd+Alt+[ sends to back', await topAt(overlap) === BAR);
  check('layer buttons: back/backward disabled at bottom', await ev(`const b = [...document.querySelectorAll('.layer-buttons button')]; return b[0].disabled && b[1].disabled && !b[2].disabled && !b[3].disabled`));
  await click('.layer-buttons button[aria-label="Bring to front"]');
  check('panel "Bring to front" works + buttons update', await topAt(overlap) === top && await ev(`const b = [...document.querySelectorAll('.layer-buttons button')]; return !b[0].disabled && b[3].disabled`));
  check('zIndex renumbered 1..n', await ev(`return [...document.querySelectorAll('[data-id="${REGION}"] .element')].map(e => e.style.zIndex).sort().join() === '1,2,3'`), await ev(`return [...document.querySelectorAll('[data-id="${REGION}"] .element')].map(e => e.style.zIndex).join()`));

  await clickAt(await pointIn([BAR]), 'right');
  check('right-click opens menu and selects element', await waitFor(`!document.querySelector('.context-menu').hidden`) && await selectedId() === BAR);
  check('menu has commands with shortcuts', await ev(`const t = document.querySelector('.context-menu').textContent; return ['Duplicate', 'Copy', 'Paste', 'Bring to front', 'Send to back', 'Delete', '⌘D'].every(s => t.includes(s))`));
  check('menu disables "Send to back" for bottom item', await ev(`return ${byText('.context-menu .menu-item', 'Send to back')}.disabled && !${byText('.context-menu .menu-item', 'Bring to front')}.disabled`));
  await clickText('.context-menu .menu-item', 'Bring to front');
  check('menu "Bring to front" applied, menu closed', await topAt(overlap) === BAR && await ev(`return document.querySelector('.context-menu').hidden`));
  await clickAt(await pointIn([BAR]), 'right');
  await key('Escape', 'Escape', 27);
  check('Escape closes menu', await ev(`return document.querySelector('.context-menu').hidden`));
  await ev(`const c = document.getElementById('canvas'); const r = c.getBoundingClientRect(); c.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 5, clientY: r.top + 5 }));`);
  check('right-click on empty canvas: only Paste', await ev(`const m = document.querySelector('.context-menu'); return !m.hidden && m.querySelectorAll('.menu-item').length === 1 && m.textContent.includes('Paste')`) && await selectedId() === null);
  await key('Escape', 'Escape', 27);
  await clickAt(await pointIn([top]), 'right');
  await clickText('.context-menu .menu-item', 'Delete');
  check('menu Delete removes element', !(await ev(`return Boolean(document.querySelector('[data-id="${top}"]'))`)));

  await click(`[data-id="${BAR}"]`);
  await ev(`const s = [...document.querySelectorAll('.properties select')].find(s => [...s.options].some(o => o.textContent === 'Section 1')); s.value = '${SALES}'; s.dispatchEvent(new Event('change', { bubbles: true }));`);
  check('Section picker moves element into chosen section', await sectionOf(BAR) === SALES && await selectedId() === BAR);
  check('picker lists every section', await ev(`return [...document.querySelectorAll('.properties select')].find(s => [...s.options].some(o => o.textContent === 'Section 1')).options.length === 5`));

  await key('s', 'KeyS', 83, META);
  check('saves (server accepts copies, new ids, renumbered z)', await waitFor(`document.querySelector('.save-status').textContent === 'Saved'`), await ev(`return document.querySelector('.save-status').textContent + ' ' + document.querySelector('.toast.is-error')?.textContent`));
  const snapshot = await ev(`return [...document.querySelectorAll('.canvas [data-id]')].map(n => n.dataset.id + ':' + n.style.left + ',' + n.style.top + ',' + n.style.zIndex + '@' + (n.closest('.section')?.dataset.id ?? '')).sort().join('|')`);
  await b.s('Page.reload'); await sleep(300);
  await waitFor(`document.querySelectorAll('.section').length === 5`);
  const after = await ev(`return [...document.querySelectorAll('.canvas [data-id]')].map(n => n.dataset.id + ':' + n.style.left + ',' + n.style.top + ',' + n.style.zIndex + '@' + (n.closest('.section')?.dataset.id ?? '')).sort().join('|')`);
  check('after reload: identical layout', snapshot === after);

  await click(`[data-id="${TEXT}"]`);
  await key('c', 'KeyC', 67, META);
  await click('.chip');
  await clickText('.menu-item', 'New dashboard');
  check('new empty dashboard opened', await waitFor(`document.querySelector('.chip-label').textContent === 'Untitled dashboard' && document.querySelectorAll('.canvas .section').length === 0`));
  await key('v', 'KeyV', 86, META);
  check('paste with no section asks for one', await waitFor(`[...document.querySelectorAll('.toast.is-error')].some(t => t.textContent.includes('Add a section first'))`));
  await clickText('.tile-name', 'Section');
  await key('v', 'KeyV', 86, META);
  check('paste works across dashboards', await waitFor(`document.querySelectorAll('.canvas .element-text').length === 1 && document.querySelector('.canvas .element-text').textContent.includes('Sales Overview')`));
  await key('s', 'KeyS', 83, META);
  check('pasted copy saves in the other dashboard', await waitFor(`document.querySelector('.save-status').textContent === 'Saved'`));

  await b.s('Page.navigate', { url: BASE + '?d=0b6f3c2e-5a41-4d8e-9a10-3f2c1d7e8a01' });
  await waitFor(`document.querySelectorAll('.canvas .section').length === 5 && window.Chart`);
  await sleep(300);
  await clickAt(await pointIn([BAR]), 'right');
  await sleep(300);
  await b.s('Page.captureScreenshot', { format: 'png' }).then((r) => fs.writeFileSync(path.join(OUT, 'shot-phase5.png'), Buffer.from(r.data, 'base64')));
  check('no JS errors', errors.length === 0, errors.join(' | '));
  console.log(`\n${ok} passed, ${fail} failed`);
  b.close(); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
