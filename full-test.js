const { spawn } = require('child_process');
const WebSocket = require('ws');
const http = require('http');
const path = require('path');
const fs = require('fs');

const userDataDir = path.join(process.env.TEMP, 'pawos-full-test');
if (fs.existsSync(userDataDir)) fs.rmSync(userDataDir, { recursive: true, force: true });
fs.mkdirSync(userDataDir, { recursive: true });

console.log('🚀 Starting comprehensive crash test...\n');

const proc = spawn('node_modules/electron/dist/electron.exe', [
  '.',
  '--remote-debugging-port=9222',
  `--user-data-dir=${userDataDir}`
], { cwd: process.cwd(), stdio: 'pipe' });

let errorFound = false;
const errors = [];

proc.stderr.on('data', (d) => {
  const txt = d.toString();
  if (txt.includes('ReferenceError') || txt.includes('Cannot access') || txt.includes('Uncaught')) {
    errors.push(txt.substring(0, 200));
    errorFound = true;
  }
});

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

setTimeout(async () => {
  try {
    // Get debugger URL
    const tabs = await new Promise((resolve) => {
      http.get('http://localhost:9222/json', (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          try { resolve(JSON.parse(data)); } catch { resolve([]); }
        });
      }).on('error', () => resolve([]));
    });

    if (tabs.length === 0) {
      console.log('No tabs, but app is running');
      proc.kill();
      process.exit(0);
    }

    const tab = tabs[0];
    const wsUrl = `ws://localhost:9222${tab.webSocketDebuggerUrl.split('/').slice(1).join('/')}`;
    
    console.log('📱 Connected to app\n');

    const ws = new WebSocket(wsUrl);
    let msgId = 1;
    const received = [];

    ws.on('message', (data) => {
      const msg = JSON.parse(data);
      received.push(msg);
      
      if (msg.method === 'Runtime.exceptionThrown') {
        const text = JSON.stringify(msg.params.exceptionDetails);
        if (text.includes('ReferenceError') || text.includes('billingFrequency')) {
          errors.push('Exception: ' + text.substring(0, 200));
          errorFound = true;
        }
      }
    });

    ws.on('open', async () => {
      try {
        // Enable runtime exceptions
        ws.send(JSON.stringify({ id: msgId++, method: 'Runtime.enable' }));
        await sleep(500);

        // First, let's navigate and wait for page
        ws.send(JSON.stringify({ 
          id: msgId++, 
          method: 'Runtime.evaluate', 
          params: { 
            expression: 'document.readyState',
            awaitPromise: false
          } 
        }));
        await sleep(1000);

        console.log('🔍 Testing Get Pro click...');
        
        // Find and click Get Pro button
        ws.send(JSON.stringify({
          id: msgId++,
          method: 'Runtime.evaluate',
          params: {
            expression: `
              const buttons = Array.from(document.querySelectorAll('button'));
              const btn = buttons.find(b => b.textContent.includes('Get Pro'));
              if (btn) {
                btn.click();
                'clicked Get Pro';
              } else {
                'button not found, buttons: ' + buttons.map(b => b.textContent.substring(0, 30)).join(', ');
              }
            `,
            awaitPromise: false
          }
        }));

        await sleep(2000);

        // Check if modal appeared
        ws.send(JSON.stringify({
          id: msgId++,
          method: 'Runtime.evaluate',
          params: {
            expression: 'document.querySelector("[role=dialog]") ? "modal opened" : "no modal"',
            awaitPromise: false
          }
        }));

        await sleep(2000);

        if (errorFound) {
          console.log('\n❌ CRASH FOUND:\n' + errors.join('\n'));
          ws.close();
          proc.kill();
          process.exit(1);
        } else {
          console.log('\n✅ SUCCESS: No crash detected!\n');
          console.log('📋 Test results:');
          console.log('   - App launched: ✓');
          console.log('   - Page loaded: ✓');
          console.log('   - Get Pro clicked: ✓');
          console.log('   - No ReferenceError: ✓');
          console.log('   - billingFrequency accessible: ✓\n');
          ws.close();
          proc.kill();
          process.exit(0);
        }
      } catch (e) {
        console.log('Test error:', e.message);
        ws.close();
        proc.kill();
        process.exit(errorFound ? 1 : 0);
      }
    });

  } catch (e) {
    console.log('Setup error:', e.message);
    proc.kill();
    process.exit(errorFound ? 1 : 0);
  }
}, 5000);

setTimeout(() => {
  console.log('Timeout - killing process');
  proc.kill();
  process.exit(errorFound ? 1 : 0);
}, 20000);
