const WebSocket = require('ws');
const http = require('http');

const PORT = 9222;

function getTarget(cb) {
  http.get(`http://127.0.0.1:${PORT}/json/list`, r => {
    let d = '';
    r.on('data', c => d += c);
    r.on('end', () => cb(JSON.parse(d).find(t => t.type === 'page')?.webSocketDebuggerUrl));
  });
}

getTarget(wsUrl => {
  if (!wsUrl) {
    console.error('No target');
    process.exit(1);
  }
  const ws = new WebSocket(wsUrl);
  let mid = 0;
  const pending = new Map();

  function send(method, params, cb) {
    const id = ++mid;
    const t = setTimeout(() => {
      pending.delete(id);
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
      if (cb) cb(null, m.result || {});
    }
  });

  ws.on('open', () => {
    console.log('Connected! Dispatching click...');
    // Click "Plan & Runtimes" stats bar item
    send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 703, y: 383, button: 'left', clickCount: 1 }, () => {
      setTimeout(() => {
        send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 703, y: 383, button: 'left', clickCount: 1 }, () => {
          console.log('Clicked. Waiting for DOM update...');
          setTimeout(() => {
            send('Runtime.evaluate', {
              expression: `
                (function() {
                  const buttons = [...document.querySelectorAll('button')].map(b => ({
                    text: b.innerText,
                    visible: b.offsetWidth > 0 && b.offsetHeight > 0
                  }));
                  const h2s = [...document.querySelectorAll('h2,h3')].map(h => h.innerText);
                  return { buttons, h2s, bodyText: document.body.innerText.slice(0, 1000) };
                })()
              `,
              returnByValue: true
            }, (err, res) => {
              console.log('Result:', JSON.stringify(res?.result?.value, null, 2));
              ws.close();
            });
          }, 2000);
        });
      }, 100);
    });
  });
});
