const fs = require('fs');
let content = fs.readFileSync('src/app/page.tsx', 'utf8');

// Remove import { HeroAnimation }
content = content.replace(/import \{ HeroAnimation \} from \"\.\.\/components\/HeroAnimation\";\s*/, '');
// Remove <HeroAnimation />
content = content.replace(/<HeroAnimation \/>\s*/, '');

// Remove bg-black, bg-neutral-950, and border-b border-neutral-900 from Sections
content = content.replace(/bg-black/g, '');
content = content.replace(/bg-neutral-950/g, '');
content = content.replace(/border-b border-neutral-900/g, '');

// The hero section also has bg-black border-b border-neutral-900
content = content.replace(/bg-black/g, ''); // just in case
content = content.replace(/border-b border-neutral-900/g, '');

fs.writeFileSync('src/app/page.tsx', content);