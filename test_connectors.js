const WebSocket = require('ws');

const debugPort = 'ws://localhost:9222/devtools/page/C9886E2CDCAE3DC8B1C9A95B2C23E74B';

async function test() {
  const ws = new WebSocket(debugPort);
  let messageId = 1;

  ws.on('open', async () => {
    console.log('Connected to Chrome DevTools Protocol');

    // First, find the Connectors button and click it
    const findCmd = {
      id: messageId++,
      method: 'Runtime.evaluate',
      params: {
        expression: `
          const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Connectors'));
          btn ? btn.click() : null;
          'Clicked Connectors button';
        `
      }
    };

    ws.send(JSON.stringify(findCmd));

    // Wait a moment and then take screenshot
    setTimeout(() => {
      const screenshotCmd = {
        id: messageId++,
        method: 'Page.captureScreenshot',
        params: {}
      };
      ws.send(JSON.stringify(screenshotCmd));
    }, 500);

    ws.on('message', (data) => {
      const msg = JSON.parse(data);
      if (msg.id === 2 && msg.result) {
        const fs = require('fs');
        const buffer = Buffer.from(msg.result.data, 'base64');
        fs.writeFileSync('connectors_submenu_test.png', buffer);
        console.log('Screenshot saved to connectors_submenu_test.png');
        ws.close();
      }
    });

    setTimeout(() => {
      ws.close();
    }, 3000);
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err.message);
  });
}

test();
