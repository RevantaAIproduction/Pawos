const fs = require("fs");

// Fix Nav.tsx
let nav = fs.readFileSync("src/components/layout/Nav.tsx", "utf8");
nav = nav.replace(/window\.dispatchEvent\(new Event\('open-download-popup'\)\)/g, 'alert("PawOS for Windows is coming soon! Please check back later to be notified.")');
fs.writeFileSync("src/components/layout/Nav.tsx", nav, "utf8");

// Fix page.tsx
let page = fs.readFileSync("src/app/page.tsx", "utf8");
page = page.replace(/window\.dispatchEvent\(new Event\('open-download-popup'\)\)/g, 'alert("PawOS for Windows is coming soon! Please check back later to be notified.")');
fs.writeFileSync("src/app/page.tsx", page, "utf8");

// Fix layout.tsx
let layout = fs.readFileSync("src/app/layout.tsx", "utf8");
layout = layout.replace('import { DownloadPopup } from "../components/ui/DownloadPopup";\n', "");
layout = layout.replace('import { DownloadPopup } from "../components/ui/DownloadPopup";\r\n', "");
layout = layout.replace('<DownloadPopup />', "");
fs.writeFileSync("src/app/layout.tsx", layout, "utf8");

fs.unlinkSync("src/components/ui/DownloadPopup.tsx");

console.log("Restored system alert.");