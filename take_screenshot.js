const WebSocket = require('ws');
const ws = new WebSocket('ws://localhost:9222/devtools/page/C9886E2CDCAE3DC8B1C9A95B2C23E74B');

ws.on('open', () => {
  ws.send(JSON.stringify({ id: 1, method: 'Page.captureScreenshot', params: {} }));
  ws.on('message', (data) => {
    const msg = JSON.parse(data);
    if (msg.id === 1 && msg.result) {
      const fs = require('fs');
      const buffer = Buffer.from(msg.result.data, 'base64');
      fs.writeFileSync('current_state.png', buffer);
      console.log('✓ Screenshot saved');
      ws.close();
      process.exit(0);
    }
  });
  setTimeout(() => { ws.close(); process.exit(1); }, 2000);
});

ws.on('error', (err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
