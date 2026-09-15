const fs = require("fs");
let layout = fs.readFileSync("src/app/layout.tsx", "utf8");

if (!layout.includes("DownloadPopup")) {
    layout = layout.replace('import { Nav } from "../components/layout/Nav";', 'import { Nav } from "../components/layout/Nav";\nimport { DownloadPopup } from "../components/ui/DownloadPopup";');
    layout = layout.replace('<Analytics />', '<Analytics />\n        <DownloadPopup />');
    fs.writeFileSync("src/app/layout.tsx", layout, "utf8");
    console.log("Injected DownloadPopup into layout.tsx");
} else {
    console.log("DownloadPopup already exists in layout.tsx");
}