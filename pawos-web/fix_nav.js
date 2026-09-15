const fs = require("fs");
let nav = fs.readFileSync("src/components/layout/Nav.tsx", "utf8");
nav = nav.replace(`<Link href="/login" className="text-sm font-medium text-neutral-400 hover:text-white transition">\r\n className="text-sm font-medium text-neutral-400 hover:text-white transition">`, `<Link href="/login" className="text-sm font-medium text-neutral-400 hover:text-white transition">`);
// Also handle Unix \n just in case
nav = nav.replace(`<Link href="/login" className="text-sm font-medium text-neutral-400 hover:text-white transition">\n className="text-sm font-medium text-neutral-400 hover:text-white transition">`, `<Link href="/login" className="text-sm font-medium text-neutral-400 hover:text-white transition">`);
fs.writeFileSync("src/components/layout/Nav.tsx", nav, "utf8");
console.log("Fixed Nav.tsx malformed JSX");