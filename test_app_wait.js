const { spawn } = require('child_process');
const WebSocket = require('ws');
const http = require('http');
const path = require('path');
const fs = require('fs');

const userDataDir = path.join(process.env.TEMP, 'pawos-test-comms');
if (fs.existsSync(userDataDir)) fs.rmSync(userDataDir, { recursive: true, force: true });
fs.mkdirSync(userDataDir, { recursive: true });

console.log('🚀 Launching PawOS app...\n');

const proc = spawn('node_modules/electron/dist/electron.exe', [
  '.',
  '--remote-debugging-port=9222',
  `--user-data-dir=${userDataDir}`
], { cwd: 'C:\\Users\\APPLE\\Downloads\\PawOS', stdio: 'pipe' });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

setTimeout(async () => {
  try {
    console.log('⏳ Waiting for app to fully load...');

    // Wait longer for app to render
    await sleep(5000);

    console.log('⏳ Querying debugger...');

    // Get correct page ID from debugger
    const tabs = await new Promise((resolve) => {
      http.get('http://localhost:9222/json', (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            resolve([]);
          }
        });
      }).on('error', () => resolve([]));
    });

    if (tabs.length === 0) {
      console.log('❌ No tabs found');
      proc.kill();
      process.exit(1);
    }

    const tab = tabs[0];
    console.log('✓ Found tab:', tab.title);

    // Extract WebSocket URL
    const wsUrl = tab.webSocketDebuggerUrl;
    console.log('📡 Connecting to:', wsUrl);

    const ws = new WebSocket(wsUrl);

    ws.on('open', () => {
      console.log('✓ Connected');
      ws.send(JSON.stringify({ id: 1, method: 'Page.captureScreenshot', params: {} }));
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data);
        if (msg.id === 1 && msg.result) {
          const buffer = Buffer.from(msg.result.data, 'base64');
          const screenshotPath = 'C:\\Users\\APPLE\\Downloads\\PawOS\\comms-panel-loaded.png';
          fs.writeFileSync(screenshotPath, buffer);
          console.log('✓ Screenshot saved:', screenshotPath);
          ws.close();
          proc.kill();
          process.exit(0);
        }
      } catch (e) {
        console.log('Error processing message:', e.message);
      }
    });

    ws.on('error', (err) => {
      console.log('❌ WebSocket error:', err.message);
      proc.kill();
      process.exit(1);
    });

    setTimeout(() => {
      console.log('⏱️ Timeout');
      ws.close();
      proc.kill();
      process.exit(1);
    }, 5000);
  } catch (err) {
    console.log('❌ Error:', err.message);
    proc.kill();
    process.exit(1);
  }
}, 5000);
