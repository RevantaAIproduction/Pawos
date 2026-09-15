const fs = require("fs");
let nav = fs.readFileSync("src/components/layout/Nav.tsx", "utf8");

// Change the header to turn black when search is open
nav = nav.replace(
    '<header className="relative transition-colors duration-300 bg-transparent">', 
    '<header className={`relative transition-colors duration-300 ${searchOpen || activeMenu ? "bg-black" : "bg-transparent"}`}>'
);

fs.writeFileSync("src/components/layout/Nav.tsx", nav, "utf8");
console.log("Added conditional bg-black to header");