const { launch } = require('./cdp.js');
const path = require('path'), fs = require('fs');
const { OUT, BASE } = require('./config.js');
let ok = 0, fail = 0;
const check = (name, cond, extra = '') => { cond ? ok++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra !== '' ? `  [${extra}]` : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const HEADER = '1c7a4d3f-6b52-4e9f-8b21-4a3d2e8f9b02', SALES = '2d8b5e4a-7c63-4fa0-9c32-5b4e3f9a0c03', REGION = '3e9c6f5b-8d74-4ab1-8d43-6c5f4a0b1d04';
const TEXT = '5abe8b7d-af96-4cd3-8f65-8e7b6c2d3f06', BAR = '7cd0ad9f-c1b8-4ef5-a187-a09d8e4f5b08';
const PNG_B64 = fs.readFileSync(path.join(__dirname, 'fixtures', 'photo.b64'), 'utf8');

(async () => {
  const b = await launch({ profile: path.join(OUT, 'chrome-e2e4') });
  const errors = [], dialogs = [];
  let dialogAnswer = { accept: true };
  b.on((m) => {
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map((a) => a.value ?? a.description).join(' '));
    if (m.method === 'Page.javascriptDialogOpening') { dialogs.push(`${m.params.type}:${m.params.message}`); b.s('Page.handleJavaScriptDialog', dialogAnswer); }
    if (m.method === 'Page.fileChooserOpened') b.s('DOM.setFileInputFiles', { files: [path.join(__dirname, 'fixtures', 'photo.png')], backendNodeId: m.params.backendNodeId });
  });
  const ev = async (expr) => {
    const r = await b.s('Runtime.evaluate', { expression: `(async () => { ${expr} })()`, awaitPromise: true, returnByValue: true, userGesture: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  };
  const waitFor = async (expr, ms = 5000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await ev(`return Boolean(${expr})`)) return true; await sleep(100); } return false; };
  const mouse = (type, x, y, clickCount = 1) => b.s('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount });
  const clickAt = async (p, count = 1) => { for (let i = 1; i <= count; i++) { await mouse('mousePressed', p.x, p.y, i); await mouse('mouseReleased', p.x, p.y, i); } await sleep(60); };
  const centerOf = (sel) => ev(`const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }`);
  const click = async (sel) => clickAt(await centerOf(sel));
  const key = async (k, code, vk, modifiers = 0) => { await b.s('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, modifiers, windowsVirtualKeyCode: vk }); await b.s('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, modifiers }); };
  const byText = (sel, text) => `[...document.querySelectorAll(${JSON.stringify(sel)})].find(n => n.textContent.trim() === ${JSON.stringify(text)})`;
  const clickText = async (sel, text) => clickAt(await ev(`const n = ${byText(sel, text)}; n.scrollIntoView({ block: 'center' }); const r = n.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }`));
  const html = (id) => ev(`return document.querySelector('[data-id="${id}"] .text-body').innerHTML`);
  const chartOf = (id) => `Chart.getChart(document.querySelector('[data-id="${id}"] canvas'))`;
  const save = async () => { await key('s', 'KeyS', 83, 4); return waitFor(`document.querySelector('.save-status').textContent === 'Saved'`); };
  const reload = async () => { await b.s('Page.reload'); await sleep(300); return waitFor(`document.querySelectorAll('.element').length > 0 && window.Chart && document.querySelector('[data-id="${BAR}"]')`); };

  await b.s('Page.setInterceptFileChooserDialog', { enabled: true });
  await b.s('Page.navigate', { url: BASE });
  check('editor loads', await waitFor(`document.querySelectorAll('.element').length === 4`));

  // ---- Chrome / layout
  check('dark chrome + rail + add tiles', await ev(`return getComputedStyle(document.querySelector('.topbar')).backgroundColor === 'rgb(30, 30, 30)' && document.querySelectorAll('.rail .icon-btn').length === 3 && document.querySelectorAll('.tile').length === 8`));
  check('chip shows dashboard name, status Saved', await ev(`return document.querySelector('.chip-label').textContent === 'Sales Overview' && document.querySelector('.save-status').textContent === 'Saved'`));
  check('breadcrumb shows dashboard', await ev(`return document.querySelector('.breadcrumbs').textContent === 'Sales Overview'`));

  // ---- Text: whole-box formatting (selected, not editing)
  await click(`[data-id="${TEXT}"]`);
  check('text selected -> toolbar shown', await waitFor(`!document.querySelector('.text-toolbar').hidden`));
  check('properties: Content tab + type/name header', await ev(`return document.querySelector('.props-type').textContent === 'Text' && document.querySelector('.props-name').textContent.startsWith('Sales Overview') && ${byText('.tab', 'Content')}.getAttribute('aria-selected') === 'true'`));
  check('breadcrumb path to element', await ev(`return document.querySelector('.breadcrumbs').textContent.replace(/\\s+/g, ' ').includes('Section 1') && document.querySelector('.breadcrumbs').textContent.includes('Text: Sales Overview')`));
  await ev(`const s = document.querySelector('.tt-select'); s.value = '18'; s.dispatchEvent(new Event('change', { bubbles: true }));`);
  check('size applies to whole text when not editing', await ev(`const body = document.querySelector('[data-id="${TEXT}"] .text-body'); const w = document.createTreeWalker(body, NodeFilter.SHOW_TEXT); let n, ok = true; while ((n = w.nextNode())) if (n.textContent.trim() && getComputedStyle(n.parentElement).fontSize !== '18px') ok = false; return ok && !body.isContentEditable && !body.innerHTML.includes('<font')`), await html(TEXT));
  await key('z', 'KeyZ', 90, 4);
  check('undo restores original html', (await html(TEXT)).includes('font-size: 28px') && !(await html(TEXT)).includes('18px'));

  // ---- Text: editing mode
  const tp = await centerOf(`[data-id="${TEXT}"] h1`);
  await clickAt(tp, 2);
  check('double-click enters editing', await waitFor(`document.querySelector('[data-id="${TEXT}"] .text-body').isContentEditable && document.activeElement.classList.contains('text-body')`));
  check('handles hidden while editing', await ev(`return getComputedStyle(document.querySelector('[data-id="${TEXT}"] > .handles')).display === 'none'`));
  await ev(`const h1 = document.querySelector('[data-id="${TEXT}"] h1'); const r = document.createRange(); r.selectNodeContents(h1.firstChild); r.collapse(false); getSelection().removeAllRanges(); getSelection().addRange(r);`);
  await b.s('Input.insertText', { text: ' 2026' });
  check('typing updates the store (Unsaved changes)', await waitFor(`document.querySelector('.save-status').textContent === 'Unsaved changes'`) && (await html(TEXT)).includes('Sales Overview 2026'));
  // select the word "revenue" and bold it via toolbar
  await ev(`const p = document.querySelector('[data-id="${TEXT}"] p'); const t = [...p.childNodes].find(n => n.nodeType === 3 && n.textContent.includes('revenue')); const i = t.textContent.indexOf('revenue'); const r = document.createRange(); r.setStart(t, i); r.setEnd(t, i + 7); getSelection().removeAllRanges(); getSelection().addRange(r);`);
  await sleep(50);
  await click('.tt-btn[aria-label^="Bold"]');
  check('bold on selected word', /<b>revenue<\/b>/.test(await html(TEXT)), await html(TEXT));
  check('bold button shows pressed', await ev(`return document.querySelector('.tt-btn[aria-label^="Bold"]').getAttribute('aria-pressed') === 'true'`));
  await ev(`const s = document.querySelector('.tt-select'); s.focus(); s.value = '24'; s.dispatchEvent(new Event('change', { bubbles: true }));`);
  check('font size on selected word -> span, no <font>', /<span style="font-size: 24px;?">(<b>)?revenue/.test(await html(TEXT)) && !(await html(TEXT)).includes('<font'), await html(TEXT));
  await ev(`const c = document.querySelector('.tt-color'); c.value = '#d03b3b'; c.dispatchEvent(new Event('input', { bubbles: true }));`);
  check('colour on selected word only', /color: rgb\(208, 59, 59\)[^<]*">revenue|color: rgb\(208, 59, 59\);">(<b>)?revenue/.test(await html(TEXT)) && !(await html(TEXT)).includes('color: rgb(208, 59, 59);">Sales'), await html(TEXT));
  check('still editing after toolbar use', await ev(`return document.querySelector('[data-id="${TEXT}"] .text-body').isContentEditable`));
  // paste as plain text
  await ev(`const dt = new DataTransfer(); dt.setData('text/plain', ' pasted'); dt.setData('text/html', '<b style="color:red">pasted</b><script>x</script>'); const h1 = document.querySelector('[data-id="${TEXT}"] h1'); const r = document.createRange(); r.selectNodeContents(h1); r.collapse(false); getSelection().removeAllRanges(); getSelection().addRange(r); document.activeElement.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));`);
  check('paste inserts plain text only', (await html(TEXT)).includes('2026 pasted') && !(await html(TEXT)).includes('color:red'), await html(TEXT));
  // auto-grow
  const h0 = await ev(`return parseInt(document.querySelector('[data-id="${TEXT}"]').style.height)`);
  await ev(`const p = document.querySelector('[data-id="${TEXT}"] p'); const r = document.createRange(); r.selectNodeContents(p); r.collapse(false); getSelection().removeAllRanges(); getSelection().addRange(r);`);
  for (let i = 0; i < 3; i++) { await b.s('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' }); await b.s('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter' }); await b.s('Input.insertText', { text: `Line ${i}` }); }
  const h1 = await ev(`return parseInt(document.querySelector('[data-id="${TEXT}"]').style.height)`);
  check('text box grows to fit new lines', h1 > h0, `${h0} -> ${h1}`);
  check('section grew and pushed sections below down', await ev(`const hd = document.querySelector('[data-id="${HEADER}"]'); const bottom = parseInt(hd.style.top) + parseInt(hd.style.height); return parseInt(hd.style.height) > 112 && parseInt(document.querySelector('[data-id="${SALES}"]').style.top) === bottom + 24 && parseInt(document.querySelector('[data-id="${REGION}"]').style.top) === bottom + 24`),
    await ev(`return ['${HEADER}', '${SALES}', '${REGION}'].map(id => { const n = document.querySelector(\`[data-id="\${id}"]\`); return n.style.top + '/' + n.style.height; }).join(' ')`));
  await key('Escape', 'Escape', 27);
  check('Escape stops editing, keeps selection', await ev(`const n = document.querySelector('[data-id="${TEXT}"]'); return !n.querySelector('.text-body').isContentEditable && n.classList.contains('is-selected')`));
  await key('Enter', 'Enter', 13);
  check('Enter re-enters editing', await waitFor(`document.querySelector('[data-id="${TEXT}"] .text-body').isContentEditable`));
  await clickAt({ x: 700, y: 800 });
  check('click outside stops editing', await ev(`return !document.querySelector('[data-id="${TEXT}"] .text-body').isContentEditable`));
  check('saved formatting survives server sanitizer', await save());
  await reload();
  const saved = await html(TEXT);
  check('after reload: bold/size/colour/typed text kept', /<b>(<span[^>]*>)*revenue/.test(saved) && saved.includes('font-size: 24px') && /color/.test(saved) && saved.includes('Sales Overview 2026 pasted') && saved.includes('Line 2'), saved);

  // ---- Image: upload via picker
  await click(`[data-id="${REGION}"]`);
  await clickText('.tile-name', 'Image');
  check('image tile adds placeholder', await waitFor(`document.querySelector('.element-image.is-selected .placeholder-button')`));
  const imgId = await ev(`return document.querySelector('.element-image.is-selected').dataset.id`);
  const w0 = await ev(`return parseInt(document.querySelector('[data-id="${imgId}"]').style.width)`);
  await click(`[data-id="${imgId}"] .placeholder-button`);
  check('picker upload sets src', await waitFor(`document.querySelector('[data-id="${imgId}"] img')?.naturalWidth === 120`, 8000));
  check('first image takes its aspect ratio', await ev(`const n = document.querySelector('[data-id="${imgId}"]'); return Math.abs(parseInt(n.style.height) - Math.round(${w0} * 80 / 120)) <= 1`), await ev(`return document.querySelector('[data-id="${imgId}"]').style.height`));
  check('alt text from file name', await ev(`return document.querySelector('[data-id="${imgId}"] img').alt === 'photo'`));
  check('image form shows Replace + fit control', await ev(`return Boolean(${byText('.btn', 'Replace')}) && document.querySelectorAll('.properties .segment').length === 3`));
  await clickText('.segment', 'Fit');
  check('fit = contain', await ev(`return document.querySelector('[data-id="${imgId}"] img').style.objectFit === 'contain'`));
  // drop a file on the header section -> new image there
  const before = await ev(`return document.querySelectorAll('[data-id="${HEADER}"] .element').length`);
  await ev(`const bytes = Uint8Array.from(atob('${PNG_B64}'), c => c.charCodeAt(0)); const dt = new DataTransfer(); dt.items.add(new File([bytes], 'orange-dot.png', { type: 'image/png' })); const s = document.querySelector('[data-id="${HEADER}"]'); const r = s.getBoundingClientRect(); const opts = { dataTransfer: dt, bubbles: true, cancelable: true, clientX: r.right - 80, clientY: r.top + r.height / 2 }; s.dispatchEvent(new DragEvent('dragover', opts)); s.dispatchEvent(new DragEvent('drop', opts));`);
  check('dropped file becomes an image in that section', await waitFor(`document.querySelectorAll('[data-id="${HEADER}"] .element').length === ${before + 1} && document.querySelector('[data-id="${HEADER}"] .element-image.is-selected img')?.alt === 'orange dot'`, 8000));
  await ev(`const dt = new DataTransfer(); dt.items.add(new File(['hi'], 'notes.txt', { type: 'text/plain' })); const s = document.querySelector('[data-id="${HEADER}"]'); const r = s.getBoundingClientRect(); const o = { dataTransfer: dt, bubbles: true, cancelable: true, clientX: r.left + 300, clientY: r.top + 40 }; s.dispatchEvent(new DragEvent('dragover', o)); s.dispatchEvent(new DragEvent('drop', o));`);
  check('non-image drop shows error toast', await waitFor(`[...document.querySelectorAll('.toast.is-error')].some(t => t.textContent.includes('Drop an image file'))`));
  await ev(`document.querySelectorAll('.toast').forEach((t) => t.remove())`); // it sits over the properties panel

  // ---- Chart settings
  await click(`[data-id="${BAR}"]`);
  check('chart form: type/title/data controls', await waitFor(`${byText('.segment', 'Bar')} && ${byText('.segment', 'My data')} && document.querySelector('.data-table')`));
  await clickText('.segment', 'Line');
  check('switch to line chart', await waitFor(`${chartOf(BAR)}?.config.type === 'line'`));
  await clickText('.segment', 'Bar');
  await ev(`const i = document.querySelector('.data-table tbody tr td:nth-child(2) input'); i.focus(); i.value = '999'; i.dispatchEvent(new Event('input', { bubbles: true }));`);
  check('editing a value redraws chart', await waitFor(`${chartOf(BAR)}.data.datasets[0].data[0] === 999`));
  await ev(`const i = document.querySelector('.data-table tbody tr td:first-child input'); i.focus(); i.value = 'Northwest'; i.dispatchEvent(new Event('input', { bubbles: true })); i.blur();`);
  check('editing a label', await waitFor(`${chartOf(BAR)}.data.labels[0] === 'Northwest'`));
  await clickText('.btn', 'Add row');
  check('add row', await waitFor(`${chartOf(BAR)}.data.labels.length === 6 && document.querySelectorAll('.data-table tbody tr').length === 6`));
  await clickText('.btn', 'Add series');
  check('add series (3 datasets, table column)', await waitFor(`${chartOf(BAR)}.data.datasets.length === 3 && document.querySelectorAll('.data-table thead th').length === 5`));
  await clickAt(await ev(`const rows = document.querySelectorAll('.series-row'); const r = rows[rows.length - 1].querySelector('.btn-icon').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }`));
  check('remove series', await waitFor(`${chartOf(BAR)}.data.datasets.length === 2`));
  await ev(`const i = document.querySelector('.properties input[maxlength="120"]'); i.focus(); i.value = 'Orders by area'; i.dispatchEvent(new Event('input', { bubbles: true })); i.blur();`);
  check('title edit', await waitFor(`${chartOf(BAR)}.options.plugins.title.text === 'Orders by area'`));
  await clickText('.segment', 'Generated');
  check('switch to generated data fetches API', await waitFor(`${chartOf(BAR)}.data.labels.length === 12 && document.querySelector('.properties select')`, 6000));
  await ev(`const s = [...document.querySelectorAll('.properties select')][1]; s.value = 'live'; s.dispatchEvent(new Event('change', { bubbles: true }));`);
  check('Live period turns auto-refresh on', await waitFor(`[...document.querySelectorAll('.properties select')][2].value === '5' && document.querySelector('[data-id="${BAR}"] .chart-status').textContent === 'Live'`, 6000));
  await ev(`const s = [...document.querySelectorAll('.properties select')][0]; s.value = 'orders'; s.dispatchEvent(new Event('change', { bubbles: true }));`);
  check('metric change refetches', await waitFor(`${chartOf(BAR)}.data.datasets[0]?.label === 'Orders'`, 6000));
  check('save chart settings', await save());
  await reload();
  check('after reload: chart keeps API settings', await waitFor(`${chartOf(BAR)}?.data.datasets[0]?.label === 'Orders' && ${chartOf(BAR)}.config.type === 'bar'`, 6000));
  await click(`[data-id="${BAR}"]`);
  await clickText('.segment', 'My data');
  check('switching back to My data keeps edited table', await waitFor(`${chartOf(BAR)}.data.labels[0] === 'Northwest' && ${chartOf(BAR)}.data.labels.length === 6`), await ev(`return JSON.stringify(${chartOf(BAR)}.data.labels)`));

  // ---- Style tab
  await clickText('.tab', 'Style');
  check('Style tab has position + layer', await waitFor(`document.querySelector('.properties .field-grid') && ${byText('.pgroup-head span', 'Layer')}`));
  await clickText('.pgroup-head span', 'Layout');
  check('groups collapse', await ev(`return document.querySelector('.pgroup').classList.contains('is-collapsed')`));
  await clickText('.pgroup-head span', 'Layout');

  // ---- Design: fill, shadow, opacity, align; kept after a reload
  const skin = `document.querySelector('[data-id="${BAR}"] .skin')`;
  const press = async (sel) => { await ev(`document.querySelector(${JSON.stringify(sel)}).scrollIntoView({ block: 'center' })`); await click(sel); };
  await clickText('.segment', 'Gradient');
  check('gradient fill paints the skin', await waitFor(`${skin}.style.background.startsWith('linear-gradient(135deg') && document.querySelector('[data-id="${BAR}"]').classList.contains('has-fill') && document.querySelector('.gradient-preview')`), await ev(`return ${skin}.style.background`));
  await press('.properties [aria-label="Add shadow"]');
  await clickText('.segment', 'L');
  check('shadow added with + and sized', await waitFor(`${skin}.style.boxShadow.includes('20px 24px -4px') && document.querySelector('.properties [aria-label="Remove shadow"]')`), await ev(`return ${skin}.style.boxShadow`));
  await ev(`const r = document.querySelector('.properties .range'); r.value = 40; r.dispatchEvent(new Event('input', { bubbles: true }));`);
  check('opacity slider fades the skin, not the selection', await waitFor(`${skin}.style.opacity === '0.4' && getComputedStyle(document.querySelector('[data-id="${BAR}"]')).opacity === '1'`));
  await press('.properties [aria-label="Align right"]');
  check('align right puts it against the section edge', await ev(`const n = document.querySelector('[data-id="${BAR}"]'); return parseInt(n.style.left) + parseInt(n.style.width) === parseInt(document.querySelector('[data-id="${REGION}"]').style.width)`), await ev(`const n = document.querySelector('[data-id="${BAR}"]'); return [n.style.left, n.style.width, n.closest('.section').dataset.id === '${REGION}', document.querySelector('[data-id="${REGION}"]').style.width].join()`));
  await key('z', 'KeyZ', 90, 4);
  check('undo reverts the align', await ev(`return document.querySelector('[data-id="${BAR}"]').style.left === '20px'`));
  check('style saved', await save());
  check('style kept after reload', await reload() && await waitFor(`${skin}.style.background.startsWith('linear-gradient') && ${skin}.style.opacity === '0.4'`), await ev(`return [${skin}?.style.background, ${skin}?.style.opacity, document.querySelector('.save-status').textContent].join(' | ')`));
  await click(`[data-id="${BAR}"]`);
  await clickText('.tab', 'Content');

  // ---- Layers + breadcrumbs
  await click('.rail [aria-label="Layers"]');
  check('layers tree lists sections and elements', await waitFor(`!document.getElementById('layers-panel').hidden && document.querySelectorAll('.layer').length === 3 + 6`), await ev(`return document.querySelectorAll('.layer').length`));
  check('selected element highlighted in layers', await ev(`return document.querySelector('.layer.is-selected')?.textContent === 'Orders by area'`), await ev(`return document.querySelector('.layer.is-selected')?.textContent`));
  await clickText('.layer', 'Section 1');
  check('click layer selects section', await ev(`return document.querySelector('[data-id="${HEADER}"]').classList.contains('is-selected')`));
  await clickText('.crumb', 'Sales Overview');
  check('breadcrumb root deselects', await ev(`return !document.querySelector('.is-selected') && document.querySelector('.props-type').textContent === 'Dashboard'`));
  await click('.rail [aria-label="Add"]');

  // ---- Devices
  const width = () => ev(`return Math.round(document.getElementById('canvas').getBoundingClientRect().width)`);
  await click('[aria-label="Tablet width"]');
  check('tablet frame 768px', await width() === 768 && await ev(`return document.querySelector('.device-width').textContent === '768 PX'`), await width());
  await click('[aria-label="Mobile width"]');
  check('mobile frame 390px', await width() === 390, await width());
  await click('[aria-label="Desktop width"]');
  check('desktop fits viewport', await width() > 768);

  // ---- Drag a tile from the Add panel onto the canvas
  await ev(`const dt = new DataTransfer(); dt.setData('application/x-dashboard-tool', JSON.stringify({ kind: 'element', id: 'heading' })); const s = document.querySelector('[data-id="${SALES}"]'); const r = s.getBoundingClientRect(); const o = { dataTransfer: dt, bubbles: true, cancelable: true, clientX: r.left + r.width * 0.5, clientY: r.bottom - 20 }; s.dispatchEvent(new DragEvent('dragover', o)); s.dispatchEvent(new DragEvent('drop', o));`);
  check('dropped Heading tile lands in that section, selected', await waitFor(`document.querySelector('[data-id="${SALES}"] .element-text.is-selected h2')?.textContent === 'Heading'`));

  // ---- Layouts
  await clickText('.tab', 'Layouts');
  check('layouts tab shows 4 presets', await ev(`return document.querySelectorAll('.tile-layout').length === 4`));
  const sections0 = await ev(`return document.querySelectorAll('.section').length`);
  await clickText('.tile-layout .tile-name', 'KPI row');
  check('KPI row adds a section with 3 stat texts', await waitFor(`document.querySelectorAll('.section').length === ${sections0 + 1} && document.querySelector('.section.is-selected').querySelectorAll('.element-text').length === 3`));
  await clickText('.tile-layout .tile-name', 'Two charts');
  check('Two charts layout draws 2 charts', await waitFor(`document.querySelector('.section.is-selected').querySelectorAll('canvas').length === 2`));
  await clickText('.tab', 'Elements');
  check('save after layouts', await save());

  // ---- Dashboard menu: new + delete
  dialogAnswer = { accept: true, promptText: 'Scratch board' };
  await click('.chip');
  check('menu lists dashboards', await waitFor(`!document.querySelector('.menu').hidden && document.querySelectorAll('.menu-item').length === 4`));
  await clickText('.menu-item', 'New dashboard');
  check('new dashboard opened', await waitFor(`document.querySelector('.chip-label').textContent === 'Scratch board' && document.querySelectorAll('.section').length === 0`));
  await click('.chip');
  await clickText('.menu-item', 'Delete this dashboard');
  check('delete asks and returns to remaining dashboard', await waitFor(`document.querySelector('.chip-label').textContent === 'Sales Overview'`) && dialogs.some((d) => d.startsWith('confirm:Delete')));
  check('only one dashboard left', await ev(`const r = await fetch('api/dashboards'); return (await r.json()).data.length === 1`));

  await sleep(400);
  await click(`[data-id="${TEXT}"]`);
  await sleep(300);
  await b.s('Page.captureScreenshot', { format: 'png' }).then((r) => fs.writeFileSync(path.join(OUT, 'shot-phase4.png'), Buffer.from(r.data, 'base64')));
  check('no JS errors', errors.length === 0, errors.join(' | '));
  console.log(`\n${ok} passed, ${fail} failed`);
  b.close(); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
