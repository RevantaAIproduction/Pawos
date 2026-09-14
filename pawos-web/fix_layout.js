const fs = require('fs');
let content = fs.readFileSync('src/app/layout.tsx', 'utf8');

content = content.replace(/import \{ Nav \} from \"\.\.\/components\/layout\/Nav\";/, 'import { Nav } from "../components/layout/Nav";\nimport { GlobalBackground } from "../components/GlobalBackground";');

content = content.replace(/<body className=\"min-h-full flex flex-col bg-neutral-950 text-neutral-100\">/, '<body className="min-h-full flex flex-col bg-black text-neutral-100">\n        <GlobalBackground />');

fs.writeFileSync('src/app/layout.tsx', content);