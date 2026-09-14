const fs = require('fs');
let content = fs.readFileSync('src/app/page.tsx', 'utf8');

content = content.replace(/\/20 p-2 shadow-2xl back/, 'bg-black/20 p-2 shadow-2xl back');

fs.writeFileSync('src/app/page.tsx', content);