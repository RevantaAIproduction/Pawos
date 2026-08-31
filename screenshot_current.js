const WebSocket = require('ws');

const debugPort = 'ws://localhost:9222/devtools/page/';

async function getPageId() {
  const http = require('http');
  return new Promise((resolve) => {
    http.get('http://localhost:9222/json/list', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const pages = JSON.parse(data);
          const mainPage = pages.find(p => p.url.includes('window=main'));
          resolve(mainPage?.id);
        } catch {
          resolve(null);
        }
      });
    });
  });
}

async function screenshot() {
  const pageId = await getPageId();
  if (!pageId) {
    console.log('Could not find main page');
    process.exit(1);
  }

  const ws = new WebSocket(`ws://localhost:9222/devtools/page/${pageId}`);

  ws.on('open', () => {
    ws.send(JSON.stringify({ id: 1, method: 'Page.captureScreenshot', params: {} }));

    ws.on('message', (data) => {
      const msg = JSON.parse(data);
      if (msg.id === 1 && msg.result) {
        const fs = require('fs');
        const buffer = Buffer.from(msg.result.data, 'base64');
        fs.writeFileSync('current_state.png', buffer);
        console.log('Screenshot saved');
        ws.close();
      }
    });

    setTimeout(() => ws.close(), 3000);
  });

  ws.on('error', (err) => {
    console.error('Error:', err.message);
    process.exit(1);
  });
}

screenshot();
