const fs = require('fs');
let content = fs.readFileSync('src/app/page.tsx', 'utf8');

content = content.replace(/Your AI coding companion\.\s*<\/p>[\s\S]*?Explore PawOS\s*<\/Button>\s*<\/div>/, 'The AI companion that gets work done.</p><div className="mt-12 flex justify-center gap-4"><Button href="/download" className="px-8 py-4 text-base font-medium bg-white text-black hover:bg-neutral-200">Download for Windows &rarr;</Button></div>');
fs.writeFileSync('src/app/page.tsx', content);