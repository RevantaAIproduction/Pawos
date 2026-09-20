const fs = require('fs');
let text = fs.readFileSync('src/renderer/conversation/ConversationPanel.tsx', 'utf8');

// Fix 1: Capability Cards visibility
text = text.replace(/\{hasMessages && \(\r?\n(\s*<div className=\{styles\.workspaceControls\}>)/, '{true && (\n$1');

// Fix 2: Send Button SVG (using context to avoid replacing other instances)
const svg = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ opacity: 0.7 }}><polyline points="15 10 20 15 15 20"></polyline><path d="M4 4v7a4 4 0 0 0 4 4h12"></path></svg>';
text = text.replace(/(title="Send \(Enter\)"\r?\n\s*>\r?\n\s*)[^\r\n]+(\r?\n\s*<\/button>)/, '$1' + svg + '$2');

fs.writeFileSync('src/renderer/conversation/ConversationPanel.tsx', text, 'utf8');