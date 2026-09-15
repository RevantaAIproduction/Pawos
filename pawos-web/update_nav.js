const fs = require("fs");

// Replace all `/download` links in Nav.tsx with direct download URL
let nav = fs.readFileSync("src/components/layout/Nav.tsx", "utf8");
nav = nav.replace(/href="\/download"/g, 'href="https://revantaai.com/downloads/pawos-windows.exe"');

// Add search button beside Company in Nav.tsx
const searchBtn = `
          <div className="hidden items-center gap-6 md:flex">
            <button className="text-sm font-medium text-neutral-400 hover:text-white transition" onClick={() => alert("Search functionality coming soon")}>
              Search
            </button>
            <Link href="/login" className="text-sm font-medium text-neutral-400 hover:text-white transition">
`;
nav = nav.replace(/<div className="hidden items-center gap-6 md:flex">\s*<Link href="\/login"/, searchBtn);

fs.writeFileSync("src/components/layout/Nav.tsx", nav, "utf8");
console.log("Updated Nav.tsx");