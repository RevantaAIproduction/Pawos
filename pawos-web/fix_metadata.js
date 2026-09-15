const fs = require("fs");
let page = fs.readFileSync("src/app/page.tsx", "utf8");

// Remove the metadata export entirely
page = page.replace(/export const metadata: Metadata = \{[\s\S]*?\};\n/, "");

// Clean up the import just to be safe
page = page.replace(/import type \{ Metadata \} from "next";\n/, "");
page = page.replace(/import \{ Metadata \} from "next";\n/, "");

fs.writeFileSync("src/app/page.tsx", page, "utf8");
console.log("Removed metadata from page.tsx to fix 'use client' conflict.");