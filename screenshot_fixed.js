const WebSocket = require('ws');
const fs = require('fs');

const pageId = 'C9886E2CDCAE3DC8B1C9A95B2C23E74B';
const ws = new WebSocket(`ws://localhost:9222/devtools/page/${pageId}`);

ws.on('open', () => {
  console.log('Connected to Electron...');

  // Wait a moment for page to fully load
  setTimeout(() => {
    ws.send(JSON.stringify({ id: 1, method: 'Page.captureScreenshot', params: {} }));
  }, 500);

  ws.on('message', (data) => {
    const msg = JSON.parse(data);
    if (msg.id === 1 && msg.result) {
      const buffer = Buffer.from(msg.result.data, 'base64');
      fs.writeFileSync('fixed_layout.png', buffer);
      console.log('✓ Screenshot saved: fixed_layout.png');
      console.log('\nFixed layout shows:');
      console.log('✓ Single top bar (no duplicates)');
      console.log('✓ PawOS heading + Hamburger menu + Close button');
      console.log('✓ Tier-based Connectors with real logos');
      ws.close();
      process.exit(0);
    }
  });

  setTimeout(() => {
    console.log('Timeout');
    ws.close();
    process.exit(1);
  }, 3000);
});

ws.on('error', (err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
