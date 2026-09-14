const fs = require('fs');
let content = fs.readFileSync('src/components/HeroAnimation.tsx', 'utf8');

content = content.replace(/className=\"absolute inset-0 h-full w-full z-0 opacity-70\"/g, 'className="fixed inset-0 h-full w-full z-0 opacity-70 pointer-events-none"');
content = content.replace(/className=\"absolute inset-0 h-full w-full object-cover z-0\"/g, 'className="fixed inset-0 h-full w-full object-cover z-0 pointer-events-none"');

fs.writeFileSync('src/components/HeroAnimation.tsx', content);