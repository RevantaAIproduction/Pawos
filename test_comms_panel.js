const WebSocket = require('ws');

const debugPort = 'ws://localhost:9222/devtools/page/89645A368AB34A033BFC51650CB350CF';

async function test() {
  const ws = new WebSocket(debugPort);

  ws.on('open', async () => {
    console.log('Connected to Chrome DevTools Protocol');

    // Send command to take screenshot
    const cmd = {
      id: 1,
      method: 'Page.captureScreenshot',
      params: {}
    };

    ws.send(JSON.stringify(cmd));

    ws.on('message', (data) => {
      const msg = JSON.parse(data);
      if (msg.id === 1 && msg.result) {
        // Save screenshot
        const fs = require('fs');
        const buffer = Buffer.from(msg.result.data, 'base64');
        fs.writeFileSync('comms_panel_test.png', buffer);
        console.log('Screenshot saved to comms_panel_test.png');
        ws.close();
      }
    });

    setTimeout(() => {
      console.log('Timeout - closing');
      ws.close();
    }, 5000);
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err.message);
  });
}

test();
