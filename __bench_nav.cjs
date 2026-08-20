'use strict';
const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');

const SHOTS = 'C:/Users/APPLE/AppData/Local/Temp/pawos-shots';
let n = 400;
let msgId = 0;
const pending = new Map();
let ws;

function getTarget(cb) {
  http.get('http://127.0.0.1:9222/json/list', r => {
    let d = ''; r.on('data', c => d += c);
    r.on('end', () => cb(JSON.parse(d).find(t => t.type === 'page')?.webSocketDebuggerUrl));
  });
}

function send(method, params, cb) {
  const id = ++msgId;
  const timer = setTimeout(() => {
    pending.delete(id);
    cb(new Error(`timeout: ${method} #${id}`));
  }, 8000);
  pending.set(id, { cb, timer });
  ws.send(JSON.stringify({ id, method, params: params || {} }));
}

function ss(label, cb) {
  send('Page.captureScreenshot', { format: 'png' }, (err, r) => {
    if (err) { console.error('ss error:', err.message); return cb(err); }
    const buf = Buffer.from(r.data, 'base64');
    const name = `${n++}-${label}`;
    fs.writeFileSync(`${SHOTS}/${name}.png`, buf);
    console.log(`📸 ${name} (${(buf.length/1024).toFixed(0)}KB)`);
    cb(null);
  });
}

function click(x, y, cb) {
  send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 }, (err) => {
    if (err) return cb(err);
    setTimeout(() => {
      send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 }, cb);
    }, 80);
  });
}

function wait(ms, cb) { setTimeout(cb, ms); }

function body(cb) {
  send('Runtime.evaluate', { expression: `document.body.innerText.slice(0,600)`, returnByValue: true }, (err, r) => {
    cb(err, r?.result?.value || '');
  });
}

// Run a sequential list of steps
function seq(steps, done) {
  const go = (i) => {
    if (i >= steps.length) return done(null);
    const step = steps[i];
    step((err) => {
      if (err) { console.warn('Step', i, 'error:', err.message); }
      go(i + 1);
    });
  };
  go(0);
}

getTarget(wsUrl => {
  console.log('Connecting:', wsUrl.slice(0, 80));
  ws = new WebSocket(wsUrl);
  ws.on('error', e => { console.error('WS error:', e.message); process.exit(1); });
  ws.on('message', data => {
    const m = JSON.parse(data);
    if (m.id && pending.has(m.id)) {
      const { cb, timer } = pending.get(m.id);
      clearTimeout(timer);
      pending.delete(m.id);
      m.error ? cb(new Error(m.error.message)) : cb(null, m.result || {});
    }
  });
  ws.on('open', () => {
    console.log('WS open — starting navigation');

    seq([
      // 1. Apps hub
      cb => click(65, 243, cb),
      cb => wait(1500, cb),
      cb => ss('apps-hub', cb),
      cb => body((e, t) => { console.log('Apps:', t.slice(0,150)); cb(e); }),

      // 2. Development tile (row1 col1 center ≈ 490,120)
      cb => { console.log('\n── Development ──'); cb(); },
      cb => click(490, 120, cb),
      cb => wait(3000, cb),
      cb => ss('dev-workspace', cb),
      cb => body((e, t) => { console.log('Dev:', t.slice(0,300)); cb(e); }),
      cb => send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 840, y: 420, deltaX: 0, deltaY: 400 }, cb),
      cb => wait(800, cb),
      cb => ss('dev-workspace-scrolled', cb),
      // Try clicking top-right area for New button
      cb => click(1350, 50, cb),
      cb => wait(500, cb),
      cb => ss('dev-new-area', cb),
      cb => body((e, t) => { console.log('Dev after new click:', t.slice(0,200)); cb(e); }),

      // 3. Back to Apps hub > Research
      cb => { console.log('\n── Research ──'); cb(); },
      cb => click(65, 243, cb),
      cb => wait(1500, cb),
      cb => click(840, 120, cb),
      cb => wait(3000, cb),
      cb => ss('research-workspace', cb),
      cb => body((e, t) => { console.log('Research:', t.slice(0,250)); cb(e); }),

      // 4. Communication
      cb => { console.log('\n── Communication ──'); cb(); },
      cb => click(65, 243, cb),
      cb => wait(1500, cb),
      cb => click(1190, 120, cb),
      cb => wait(3000, cb),
      cb => ss('communication-workspace', cb),
      cb => body((e, t) => { console.log('Communication:', t.slice(0,250)); cb(e); }),

      // 5. Office
      cb => { console.log('\n── Office ──'); cb(); },
      cb => click(65, 243, cb),
      cb => wait(1500, cb),
      cb => click(490, 295, cb),
      cb => wait(3000, cb),
      cb => ss('office-workspace', cb),
      cb => body((e, t) => { console.log('Office:', t.slice(0,250)); cb(e); }),

      // 6. Cloud
      cb => { console.log('\n── Cloud ──'); cb(); },
      cb => click(65, 243, cb),
      cb => wait(1500, cb),
      cb => click(840, 295, cb),
      cb => wait(3000, cb),
      cb => ss('cloud-workspace', cb),
      cb => body((e, t) => { console.log('Cloud:', t.slice(0,250)); cb(e); }),

      // 7. Files
      cb => { console.log('\n── Files ──'); cb(); },
      cb => click(65, 243, cb),
      cb => wait(1500, cb),
      cb => click(1190, 295, cb),
      cb => wait(3000, cb),
      cb => ss('files-workspace', cb),
      cb => body((e, t) => { console.log('Files:', t.slice(0,250)); cb(e); }),

      // 8. Enable companion
      cb => { console.log('\n── Enable companion ──'); cb(); },
      cb => click(65, 130, cb),
      cb => wait(1200, cb),
      cb => ss('home-pre-companion', cb),
      cb => click(843, 278, cb),
      cb => wait(4000, cb),
      cb => ss('companion-enabled-attempt', cb),
      cb => body((e, t) => { console.log('Companion enabled?:', t.slice(0,300)); cb(e); }),
      cb => wait(2000, cb),
      cb => ss('companion-chat-state', cb),

      // 9. Account menu (click T avatar ~37,810)
      cb => { console.log('\n── Account menu ──'); cb(); },
      cb => click(37, 810, cb),
      cb => wait(1500, cb),
      cb => ss('account-menu-attempt', cb),
      cb => body((e, t) => { console.log('Account:', t.slice(0,250)); cb(e); }),

      // Try different y positions for account
      cb => click(65, 812, cb),
      cb => wait(800, cb),
      cb => ss('account-65-812', cb),

      // 10. Projects sidebar item
      cb => { console.log('\n── Projects sidebar ──'); cb(); },
      cb => click(65, 205, cb),
      cb => wait(1500, cb),
      cb => ss('projects-sidebar', cb),
      cb => body((e, t) => { console.log('Projects:', t.slice(0,200)); cb(e); }),

      // 11. Companion Studio
      cb => click(65, 167, cb),
      cb => wait(1500, cb),
      cb => ss('companion-studio-detail', cb),
      cb => body((e, t) => { console.log('Companion Studio:', t.slice(0,200)); cb(e); }),
      cb => send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 840, y: 420, deltaX: 0, deltaY: 500 }, cb),
      cb => wait(600, cb),
      cb => ss('companion-studio-scrolled', cb),

      // 12. Working History
      cb => click(65, 343, cb),
      cb => wait(1200, cb),
      cb => ss('working-history-detail', cb),

    ], (err) => {
      if (err) console.error('Fatal error:', err.message);
      const total = fs.readdirSync(SHOTS).filter(f => f.endsWith('.png')).length;
      console.log(`\n✅ Done — ${total} screenshots total`);
      ws.close();
      process.exit(0);
    });
  });
});
