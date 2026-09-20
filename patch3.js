const fs = require('fs');
let text = fs.readFileSync('src/renderer/conversation/ConversationPanel.tsx', 'utf8');
const svg = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ opacity: 0.7 }}><polyline points="15 10 20 15 15 20"></polyline><path d="M4 4v7a4 4 0 0 0 4 4h12"></path></svg>';
text = text.replace('→', svg);
fs.writeFileSync('src/renderer/conversation/ConversationPanel.tsx', text, 'utf8');