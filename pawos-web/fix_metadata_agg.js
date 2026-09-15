const fs = require("fs");
let page = fs.readFileSync("src/app/page.tsx", "utf8");

page = page.replace(/import type \{ Metadata \} from "next";\r?\n/, "");
// Replace metadata block
const start = page.indexOf("export const metadata");
if (start !== -1) {
    const end = page.indexOf("};", start) + 2;
    page = page.substring(0, start) + page.substring(end);
}

// Ensure no empty newlines left behind if needed
fs.writeFileSync("src/app/page.tsx", page, "utf8");
console.log("Metadata stripped aggressively.");