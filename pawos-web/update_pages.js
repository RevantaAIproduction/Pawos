const fs = require("fs");

let page = fs.readFileSync("src/app/page.tsx", "utf8");
page = page.replace(/href="\/download"/g, 'href="https://revantaai.com/downloads/pawos-windows.exe"');
fs.writeFileSync("src/app/page.tsx", page, "utf8");
console.log("Updated page.tsx");

let about = fs.readFileSync("src/app/about/page.tsx", "utf8");
about = about.replace(/href="\/download"/g, 'href="https://revantaai.com/downloads/pawos-windows.exe"');
fs.writeFileSync("src/app/about/page.tsx", about, "utf8");
console.log("Updated about/page.tsx");