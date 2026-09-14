const fs = require('fs');
let content = fs.readFileSync('src/app/page.tsx', 'utf8');

// Import HeroAnimation
if (!content.includes('HeroAnimation')) {
    content = content.replace('import { ConnectionsGraphic } from "../components/ConnectionsGraphic";', 'import { ConnectionsGraphic } from "../components/ConnectionsGraphic";\nimport { HeroAnimation } from "../components/HeroAnimation";');
}

// Add HeroAnimation to first section
if (!content.includes('<HeroAnimation />')) {
    content = content.replace('<section className="relative min-h-[90vh] flex flex-col items-center justify-center text-center px-6">', '<section className="relative min-h-[90vh] flex flex-col items-center justify-center text-center px-6">\n        <HeroAnimation />\n        <div className="relative z-10">');
    // Need to close that z-10 div
    content = content.replace('Explore PawOS\n          </Button>\n        </div>\n      </section>', 'Explore PawOS\n          </Button>\n        </div>\n        </div>\n      </section>');
}

// Add backgrounds to other sections
// section 2
content = content.replace('<section className="py-32 px-6">', '<section className="py-32 px-6 bg-black relative z-10">');
// section 3
content = content.replace('<section className="py-32 px-6">', '<section className="py-32 px-6 bg-neutral-950 relative z-10">');
// section 4
content = content.replace('<section className="py-32 px-6">', '<section className="py-32 px-6 bg-black relative z-10">');
// section 5
content = content.replace('<section className="py-32 px-6">', '<section className="py-32 px-6 bg-neutral-950 relative z-10">');
// section 6
content = content.replace('<section className="py-32 px-6">', '<section className="py-32 px-6 bg-black relative z-10">');
// section 7
content = content.replace('<section className="py-32 px-6">', '<section className="py-32 px-6 bg-neutral-950 relative z-10">');
// section 8
content = content.replace('<section className="py-32 px-6 relative">', '<section className="py-32 px-6 bg-black relative z-10 border-t border-neutral-900">');
// section 10
content = content.replace('<section className="py-32 px-6">', '<section className="py-32 px-6 bg-neutral-950 relative z-10 border-t border-neutral-900">');
// section 11
content = content.replace('<section className="py-32 px-6">', '<section className="py-32 px-6 bg-black relative z-10 border-t border-neutral-900">');
// section 12
content = content.replace('<section className="py-32 px-6 text-center border-t border-neutral-900 mt-20">', '<section className="py-32 px-6 text-center bg-neutral-950 relative z-10 border-t border-neutral-900">');

fs.writeFileSync('src/app/page.tsx', content);