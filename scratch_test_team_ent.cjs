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

  function click(x, y, cb) {
    send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 }, () => {
      setTimeout(() => send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 }, cb), 100);
    });
  }

  ws.on('open', () => {
    // 1. Open settings
    click(703, 383, () => {
      setTimeout(() => {
        // 2. Click "Team and Enterprise" tab
        // Let's evaluate in JS to find and click the "Team and Enterprise" button
        send('Runtime.evaluate', {
          expression: `
            (function() {
              const btn = [...document.querySelectorAll('button')].find(b => b.innerText.includes('Team and Enterprise'));
              if (btn) {
                const rect = btn.getBoundingClientRect();
                return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
              }
              return null;
            })()
          `,
          returnByValue: true
        }, (err, res) => {
          const coords = res?.result?.value;
          if (!coords) {
            console.error('Could not find Team and Enterprise tab button');
            ws.close();
            process.exit(1);
          }
          console.log('Clicking Team and Enterprise tab at:', coords);
          click(Math.round(coords.x), Math.round(coords.y), () => {
            setTimeout(() => {
              // Get new page state
              send('Runtime.evaluate', {
                expression: `
                  (function() {
                    const buttons = [...document.querySelectorAll('button')].map(b => b.innerText);
                    const h2s = [...document.querySelectorAll('h2,h3')].map(h => h.innerText);
                    return { buttons, h2s, bodyText: document.body.innerText.slice(0, 1000) };
                  })()
                `,
                returnByValue: true
              }, (err, stateRes) => {
                console.log('--- Team and Enterprise Page State ---');
                console.log(JSON.stringify(stateRes?.result?.value, null, 2));

                // Take screenshot
                send('Page.captureScreenshot', { format: 'png' }, (err, screenshotRes) => {
                  const buf = Buffer.from(screenshotRes.data, 'base64');
                  const filename = path.join(OUTPUT_DIR, '02-team-enterprise-comparison.png');
                  fs.writeFileSync(filename, buf);
                  console.log(`Saved screenshot to ${filename}`);
                  ws.close();
                  process.exit(0);
                });
              });
            }, 2000);
          });
        });
      }, 2000);
    });
  });
});
