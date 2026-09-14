const fs = require('fs');
let content = fs.readFileSync('src/app/download/page.tsx', 'utf8');

content = content.replace(/bg-neutral-950/g, '');
content = content.replace(/bg-neutral-900\/30/g, '');

fs.writeFileSync('src/app/download/page.tsx', content);