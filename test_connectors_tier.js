const WebSocket = require('ws');

const debugPort = 'ws://localhost:9222/devtools/page/C9886E2CDCAE3DC8B1C9A95B2C23E74B';

async function test() {
  const ws = new WebSocket(debugPort);
  let messageId = 1;

  ws.on('open', async () => {
    console.log('Connected. Finding Add menu and Connectors...');

    // Find and click the Add (+) button first
    const addBtnCmd = {
      id: messageId++,
      method: 'Runtime.evaluate',
      params: {
        expression: `
          const buttons = document.querySelectorAll('button');
          for (let b of buttons) {
            if (b.textContent.trim() === '+') {
              b.click();
              console.log('Clicked Add button');
              break;
            }
          }
          'Add button clicked';
        `
      }
    };

    ws.send(JSON.stringify(addBtnCmd));

    // Wait and then click Connectors button
    setTimeout(() => {
      const connectorsBtnCmd = {
        id: messageId++,
        method: 'Runtime.evaluate',
        params: {
          expression: `
            const buttons = document.querySelectorAll('button');
            for (let b of buttons) {
              if (b.textContent.includes('Connectors')) {
                b.click();
                console.log('Clicked Connectors');
                break;
              }
            }
            'Connectors clicked';
          `
        }
      };
      ws.send(JSON.stringify(connectorsBtnCmd));
    }, 300);

    // Wait and take screenshot
    setTimeout(() => {
      const screenshotCmd = {
        id: messageId++,
        method: 'Page.captureScreenshot',
        params: {}
      };
      ws.send(JSON.stringify(screenshotCmd));
    }, 700);

    ws.on('message', (data) => {
      const msg = JSON.parse(data);
      if (msg.id === 3 && msg.result) {
        const fs = require('fs');
        const buffer = Buffer.from(msg.result.data, 'base64');
        fs.writeFileSync('connectors_submenu_test.png', buffer);
        console.log('✓ Screenshot saved to connectors_submenu_test.png');
        ws.close();
      }
    });

    setTimeout(() => {
      ws.close();
    }, 2000);
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err.message);
  });
}

test();
