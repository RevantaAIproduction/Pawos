const fs = require("fs");
let nav = fs.readFileSync("src/components/layout/Nav.tsx", "utf8");

// Fix the padding so it sits flush to the edge like the user wants
nav = nav.replace('px-8 md:px-12', 'px-4 md:px-6');

// Fix the duplicated w-full w-full in the dropdown
nav = nav.replace('className="w-full w-full px-6"', 'className="w-full max-w-none px-4 md:px-6"');

// Fix mx-auto just in case
nav = nav.replace('mx-auto flex w-full', 'flex w-full');

fs.writeFileSync("src/components/layout/Nav.tsx", nav, "utf8");
console.log("Removed padding and mx-auto");