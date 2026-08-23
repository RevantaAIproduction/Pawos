const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 9222;
const OUTPUT_DIR = 'C:/Users/APPLE/.gemini/antigravity/brain/e5fbd72d-6754-40b2-8b24-bc376f3cf24c';

function getTarget(cb) {
  http.get(`http://127.0.0.1:${PORT}/json/list`, r => {
    let d = '';
    r.on('data', c => d += c);
    r.on('end', () => cb(JSON.parse(d).find(t => t.type === 'page')?.webSocketDebuggerUrl));
  });
}

getTarget(wsUrl => {
  if (!wsUrl) {
    console.error('No inspectable page found on port 9222');
    process.exit(1);
  }
  console.log('Connecting to target:', wsUrl);
  const ws = new WebSocket(wsUrl);
  let mid = 0;
  const pending = new Map();

  function send(method, params, cb) {
    const id = ++mid;
    const t = setTimeout(() => {
      pending.delete(id);
      console.warn(`Timeout: ${method} #${id}`);
      if (cb) cb(new Error('timeout'));
    }, 10000);
    pending.set(id, { cb, t });
    ws.send(JSON.stringify({ id, method, params: params || {} }));
  }

  ws.on('message', data => {
    const m = JSON.parse(data);
    if (m.id && pending.has(m.id)) {
      const { cb, t } = pending.get(m.id);
      clearTimeout(t);
      pending.delete(m.id);
      if (cb) m.error ? cb(new Error(m.error.message)) : cb(null, m.result || {});
    }
  });

  ws.on('open', () => {
    console.log('Connected!');
    send('Runtime.evaluate', { expression: 'document.body.innerText.slice(0, 1000)', returnByValue: true }, (err, res) => {
      if (err) console.error('Eval error:', err);
      console.log('--- Page text content ---');
      console.log(res?.result?.value || '(empty)');
      console.log('-------------------------');

      // Capture screenshot
      send('Page.captureScreenshot', { format: 'png' }, (err, screenshotRes) => {
        if (err) {
          console.error('Screenshot error:', err);
          ws.close();
          process.exit(1);
        }
        const buf = Buffer.from(screenshotRes.data, 'base64');
        const filename = path.join(OUTPUT_DIR, '01-baseline.png');
        fs.writeFileSync(filename, buf);
        console.log(`Saved screenshot to ${filename} (${(buf.length / 1024).toFixed(0)} KB)`);
        ws.close();
        process.exit(0);
      });
    });
  });
});
