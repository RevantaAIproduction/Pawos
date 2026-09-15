const fs = require("fs");
let layout = fs.readFileSync("src/app/layout.tsx", "utf8");

// We can just replace the specific broken strings with standard hyphens
// Let's replace the whole string to be safe
layout = layout.replace(/PawOS.*Your AI desktop companion/g, "PawOS - Your AI desktop companion");
layout = layout.replace(/%s.*PawOS"/g, '%s - PawOS"');
layout = layout.replace(/communicate.*with autonomous/g, 'communicate - with autonomous');
layout = layout.replace(/Paw Go.*free tier/g, 'Paw Go - free tier');

// Also do a generic replace for any remaining mojibake or em-dashes
layout = layout.replace(/â€”/g, "-");
layout = layout.replace(/\?"/g, "-");
// Also just find all non-ascii characters in the metadata section and fix them
layout = layout.replace(/PawOS[^\w]*Your AI desktop companion/g, "PawOS - Your AI desktop companion");

fs.writeFileSync("src/app/layout.tsx", layout, "utf8");
console.log("Fixed metadata characters.");