const fs = require("fs");
let nav = fs.readFileSync("src/components/layout/Nav.tsx", "utf8");

nav = nav.replace('bg-black">\n        <nav className="flex w-full', 'bg-transparent">\n        <nav className="flex w-full');
// just in case it doesn't match exactly
nav = nav.replace('className="relative transition-colors duration-300 bg-black"', 'className="relative transition-colors duration-300 bg-transparent"');

fs.writeFileSync("src/components/layout/Nav.tsx", nav, "utf8");
console.log("Restored transparent background");