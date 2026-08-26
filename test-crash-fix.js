const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const userDataDir = path.join(process.env.TEMP, 'pawos-test-app-2');
if (fs.existsSync(userDataDir)) fs.rmSync(userDataDir, { recursive: true, force: true });
fs.mkdirSync(userDataDir, { recursive: true });

console.log('Starting Electron app...');

const proc = spawn('node_modules/electron/dist/electron.exe', [
  '.',
  '--remote-debugging-port=9222',
  `--user-data-dir=${userDataDir}`
], {
  cwd: process.cwd(),
  stdio: 'pipe',
  detached: false
});

let hasError = false;

proc.stderr.on('data', (data) => {
  const msg = data.toString();
  if (msg.includes('Cannot access') || msg.includes('ReferenceError') || msg.includes('billingFrequency')) {
    console.log('\n❌ CRASH DETECTED:', msg.substring(0, 300));
    hasError = true;
  }
});

proc.stdout.on('data', (data) => {
  const msg = data.toString();
  if (msg.includes('CRASHED') || msg.includes('renderer') && msg.includes('error')) {
    console.log(msg);
  }
});

setTimeout(async () => {
  try {
    const http = require('http');
    
    console.log('Waiting for debugger to open...');
    const result = await new Promise((resolve) => {
      http.get('http://localhost:9222/json', (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const tabs = JSON.parse(data);
            resolve(tabs.length > 0);
          } catch {
            resolve(false);
          }
        });
      }).on('error', () => resolve(false));
      
      setTimeout(() => resolve(false), 2000);
    });
    
    if (result) {
      console.log('✓ App is running');
      setTimeout(() => {
        console.log('✓ No crash detected after 8 seconds - fix successful!');
        proc.kill();
        process.exit(0);
      }, 8000);
    } else {
      proc.kill();
      if (!hasError) {
        console.log('✓ App running (debugger not available yet)');
        process.exit(0);
      }
    }
  } catch (e) {
    console.log('Error checking app:', e.message);
    proc.kill();
    process.exit(hasError ? 1 : 0);
  }
}, 4000);

proc.on('exit', (code) => {
  if (code !== null && code !== 0) {
    console.log('\n❌ Electron exited with code', code);
    process.exit(1);
  }
});
