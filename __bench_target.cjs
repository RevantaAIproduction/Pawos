'use strict';
const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 9222;
const SHOTS = 'C:/Users/APPLE/AppData/Local/Temp/pawos-shots';
let n = 400;

function getWsUrl() {
  return new Promise((res, rej) => {
    http.get(`http://127.0.0.1:${PORT}/json/list`, r => {
      let d = ''; r.on('data', c => d += c);
      r.on('end', () => res(JSON.parse(d).find(t => t.type === 'page')?.webSocketDebuggerUrl));
    }).on('error', rej);
  });
}

let mid = 0; const pend = new Map(); let ws;
function send(m, p = {}) {
  return new Promise((res, rej) => {
    const i = ++mid; pend.set(i, { res, rej });
    ws.send(JSON.stringify({ id: i, method: m, params: p }));
  });
}
async function ss(label) {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  const buf = Buffer.from(r.data, 'base64');
  const name = `${n++}-${label}`;
  fs.writeFileSync(path.join(SHOTS, `${name}.png`), buf);
  console.log(`📸 ${name} (${(buf.length/1024).toFixed(0)}KB)`);
}
async function click(x, y) {
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await new Promise(r => setTimeout(r, 80));
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
}
async function wait(ms) { return new Promise(r => setTimeout(r, ms)); }
async function bodyText() {
  const r = await send('Runtime.evaluate', { expression: `document.body.innerText.slice(0,800)`, returnByValue: true });
  return r.result?.value || '';
}

async function run() {
  const wsUrl = await getWsUrl();
  if (!wsUrl) throw new Error('No CDP page target');
  console.log('CDP:', wsUrl.slice(0,80));
  ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });
  ws.on('message', data => {
    const m = JSON.parse(data);
    if (m.id && pend.has(m.id)) {
      const { res, rej } = pend.get(m.id);
      pend.delete(m.id);
      m.error ? rej(new Error(m.error.message)) : res(m.result || {});
    }
  });
  await send('Page.enable');
  await wait(500);

  // ── 1. Go to Apps hub
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape' });
  await wait(300);
  await click(65, 243);
  await wait(1500);
  await ss('apps-hub');
  console.log('Apps:', (await bodyText()).slice(0, 200));

  // ── 2. Development tile: row1 col1, center ≈ (490, 120)
  console.log('\n── Development ──');
  await click(490, 120);
  await wait(3000);
  await ss('dev-workspace');
  const devText = await bodyText();
  console.log('Dev text:', devText.slice(0, 400));

  await ss('dev-workspace-2');
  // scroll to see more
  await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 840, y: 420, deltaX: 0, deltaY: 400 });
  await wait(800);
  await ss('dev-workspace-scrolled');

  // ── 3. Try New button area (top-right corner often has + or New)
  await click(1350, 50);  await wait(500);
  await ss('dev-new-click-1350-50');
  await click(1330, 87);  await wait(500);
  await ss('dev-new-click-1330-87');

  // ── 4. Back to Apps hub
  console.log('\n── Back / Research ──');
  await click(65, 87);  // Back button in top-left
  await wait(1000);
  await ss('back-btn-attempt');

  await click(65, 243);  // Apps
  await wait(1500);
  await ss('apps-hub-2');

  // ── 5. Research tile: row1 col2, center ≈ (840, 120)
  await click(840, 120);
  await wait(3000);
  await ss('research-workspace');
  console.log('Research:', (await bodyText()).slice(0, 300));

  // ── 6. Communication: row1 col3, center ≈ (1190, 120)
  await click(65, 243); await wait(1200);
  await click(1190, 120); await wait(3000);
  await ss('communication-workspace');
  console.log('Communication:', (await bodyText()).slice(0, 300));

  // ── 7. Office: row2 col1, center ≈ (490, 295)
  await click(65, 243); await wait(1200);
  await click(490, 295); await wait(3000);
  await ss('office-workspace');
  console.log('Office:', (await bodyText()).slice(0, 300));

  // ── 8. Cloud: row2 col2, center ≈ (840, 295)
  await click(65, 243); await wait(1200);
  await click(840, 295); await wait(3000);
  await ss('cloud-workspace');
  console.log('Cloud:', (await bodyText()).slice(0, 300));

  // ── 9. Files: row2 col3, center ≈ (1190, 295)
  await click(65, 243); await wait(1200);
  await click(1190, 295); await wait(3000);
  await ss('files-workspace');
  console.log('Files:', (await bodyText()).slice(0, 300));

  // ── 10. Home then Enable companion
  console.log('\n── Companion enable ──');
  await click(65, 130);  // Home
  await wait(1200);
  await ss('home-companion-off');
  // Click the Enable companion button (center of page, roughly y=278)
  await click(843, 278);
  await wait(4000);
  await ss('companion-after-enable');
  console.log('Companion:', (await bodyText()).slice(0, 400));
  // One more screenshot to see if companion chat appeared
  await wait(2000);
  await ss('companion-chat');

  // ── 11. Account menu: click "T" avatar (x≈37, y≈810 or x≈140, y≈810)
  console.log('\n── Account / Settings ──');
  // Try clicking directly on the avatar circle at bottom-left
  await click(37, 810);
  await wait(1500);
  await ss('account-menu-37-810');
  console.log('Account menu (37):', (await bodyText()).slice(0, 300));

  // Try 65, 810
  await click(65, 810);
  await wait(1000);
  await ss('account-menu-65-810');
  console.log('Account menu (65):', (await bodyText()).slice(0, 200));

  // ── 12. Companion Studio detail
  console.log('\n── Companion Studio ──');
  await click(65, 167);  // Companion Studio
  await wait(1500);
  await ss('companion-studio-full');

  // Try scrolling down to see all companions
  await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 840, y: 420, deltaX: 0, deltaY: 400 });
  await wait(600);
  await ss('companion-studio-scrolled');

  // ── 13. Working History
  await click(65, 343);  // Working History
  await wait(1200);
  await ss('working-history-full');
  console.log('Working History:', (await bodyText()).slice(0, 200));

  // ── 14. Projects sidebar (y=205)
  await click(65, 205);
  await wait(1500);
  await ss('projects-sidebar-item');
  console.log('Projects:', (await bodyText()).slice(0, 200));

  ws.close();
  const total = fs.readdirSync(SHOTS).filter(f => f.endsWith('.png')).length;
  console.log(`\n✅ Done — ${total} total screenshots`);
}

run().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
