const fs = require("fs");

// Fix Nav.tsx
let nav = fs.readFileSync("src/components/layout/Nav.tsx", "utf8");
nav = nav.replace(/alert\("PawOS for Windows is coming soon! Please check back later to be notified."\)/g, "window.dispatchEvent(new Event('open-download-popup'))");
fs.writeFileSync("src/components/layout/Nav.tsx", nav, "utf8");

// Fix page.tsx
let page = fs.readFileSync("src/app/page.tsx", "utf8");
// Fix the hero button
page = page.replace(/alert\("PawOS for Windows is coming soon! Please check back later to be notified."\)/g, "window.dispatchEvent(new Event('open-download-popup'))");
// Fix any remaining Button with href to the actual exe file
page = page.replace(/<Button href="https:\/\/revantaai\.com\/downloads\/pawos-windows\.exe"([^>]*)>([\s\S]*?)<\/Button>/g, "<button onClick={() => window.dispatchEvent(new Event('open-download-popup'))}$1>$2</button>");

fs.writeFileSync("src/app/page.tsx", page, "utf8");
console.log("Updated buttons to trigger popup");