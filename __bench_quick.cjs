'use strict';
const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');

console.log('Getting target...');
http.get('http://127.0.0.1:9222/json/list', r => {
  let d = ''; r.on('data', c => d += c);
  r.on('end', () => {
    const list = JSON.parse(d);
    console.log('Targets:', list.length);
    const t = list.find(x => x.type === 'page');
    if (!t) { console.log('No page target'); return; }
    console.log('Connecting to:', t.webSocketDebuggerUrl);

    const ws = new WebSocket(t.webSocketDebuggerUrl);
    ws.on('error', e => { console.error('WS error:', e.message); process.exit(1); });
    ws.on('open', () => {
      console.log('WS open — sending screenshot');
      ws.send(JSON.stringify({ id: 1, method: 'Page.captureScreenshot', params: { format: 'png' } }));
    });
    ws.on('message', data => {
      const m = JSON.parse(data);
      console.log('Got message id:', m.id, 'has data:', !!m.result?.data);
      if (m.result?.data) {
        fs.writeFileSync('C:/Users/APPLE/AppData/Local/Temp/pawos-shots/quick-test.png', Buffer.from(m.result.data, 'base64'));
        console.log('Screenshot saved!');
      }
      ws.close();
    });
    setTimeout(() => { console.log('Timeout — no response'); ws.close(); }, 10000);
  });
});
