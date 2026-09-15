const fs = require("fs");
let nav = fs.readFileSync("src/components/layout/Nav.tsx", "utf8");
if (!nav.includes("/careers")) {
    nav = nav.replace('{ href: "/about", label: "About" },', '{ href: "/about", label: "About" },\n          { href: "/careers", label: "Careers" },');
    fs.writeFileSync("src/components/layout/Nav.tsx", nav, "utf8");
    console.log("Added careers to Nav.tsx");
}

let footer = fs.readFileSync("src/components/layout/Footer.tsx", "utf8");
if (!footer.includes("/careers")) {
    footer = footer.replace('{ href: "/about", label: "About PawOS" },', '{ href: "/about", label: "About PawOS" },\n      { href: "/careers", label: "Careers" },');
    fs.writeFileSync("src/components/layout/Footer.tsx", footer, "utf8");
    console.log("Added careers to Footer.tsx");
}