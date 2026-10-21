const { spawn } = require('child_process');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

exports.launch = async function launch({ profile, width = 1440, height = 900 }) {
  const proc = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--remote-debugging-pipe',
    `--user-data-dir=${profile}`, `--window-size=${width},${height}`, 'about:blank'],
    { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
  const out = proc.stdio[3], inp = proc.stdio[4];
  let id = 0, buf = '';
  const pending = new Map(), handlers = [];
  inp.on('data', (chunk) => {
    buf += chunk.toString();
    let i;
    while ((i = buf.indexOf('\0')) >= 0) {
      const msg = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1);
      if (msg.id && pending.has(msg.id)) { const { res, rej } = pending.get(msg.id); pending.delete(msg.id); msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result); }
      else handlers.forEach((h) => h(msg));
    }
  });
  const send = (method, params = {}, sessionId) => new Promise((res, rej) => {
    const msgId = ++id; pending.set(msgId, { res, rej });
    out.write(JSON.stringify({ id: msgId, method, params, sessionId }) + '\0');
  });
  const attach = async (targetId) => {
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    const s = (method, params) => send(method, params, sessionId);
    const on = (fn) => handlers.push((m) => m.sessionId === sessionId && fn(m));
    await s('Page.enable'); await s('Runtime.enable');
    return { s, on };
  };
  const { targetInfos } = await send('Target.getTargets');
  const first = await attach(targetInfos.find((t) => t.type === 'page').targetId);
  return {
    ...first,
    async newPage(url = 'about:blank') {
      const { targetId } = await send('Target.createTarget', { url });
      return attach(targetId);
    },
    close: () => proc.kill(),
  };
};
