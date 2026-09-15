const fs = require("fs");
let nav = fs.readFileSync("src/components/layout/Nav.tsx", "utf8");

// Change sticky to fixed w-full
nav = nav.replace(
    '<div className="sticky top-0 z-50 group" onMouseLeave={() => setActiveMenu(null)}>',
    '<div className="fixed top-0 left-0 right-0 z-50 group" onMouseLeave={() => setActiveMenu(null)}>'
);

fs.writeFileSync("src/components/layout/Nav.tsx", nav, "utf8");
console.log("Updated Nav to fixed position");