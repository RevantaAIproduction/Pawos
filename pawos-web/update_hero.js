const fs = require("fs");
let page = fs.readFileSync("src/app/page.tsx", "utf8");

const oldButtons = `<div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button href="https://revantaai.com/downloads/pawos-windows.exe" className="px-8 py-4 text-base font-medium bg-white text-black hover:bg-neutral-200">
            Download for Windows &rarr;
          </Button>
          <Button href="/about" variant="secondary" className="px-8 py-4 text-base font-medium bg-transparent text-white border border-neutral-700 hover:bg-neutral-900">
            Explore PawOS
          </Button>
        </div>`;

const newButtons = `<div className="flex justify-center">
          <button onClick={() => alert("PawOS for Windows is coming soon! Please check back later to be notified.")} className="px-8 py-4 text-base font-medium bg-white text-black rounded-full hover:bg-neutral-200 transition">
            Download for Windows &rarr;
          </button>
        </div>`;

if (page.includes(oldButtons)) {
    page = page.replace(oldButtons, newButtons);
    // Let's make sure we add 'use client' if it's not there, because we added onClick
    if (!page.includes("'use client'")) {
        page = "'use client';\n" + page;
    }
    // Remove Metadata export since it conflicts with 'use client' in Next.js app router
    page = page.replace(/export const metadata: Metadata = [\s\S]*?};\n/g, "");
    
    fs.writeFileSync("src/app/page.tsx", page, "utf8");
    console.log("Updated Hero Buttons.");
} else {
    console.log("Could not find exactly. Using fallback regex.");
    // Fallback if formatting was slightly off
    page = page.replace(/<div className="flex flex-col sm:flex-row gap-4 justify-center">[\s\S]*?Explore PawOS[\s\S]*?<\/div>/, newButtons);
    
    if (!page.includes("'use client'")) {
        page = "'use client';\n" + page;
    }
    page = page.replace(/export const metadata: Metadata = [\s\S]*?};\n/g, "");
    
    fs.writeFileSync("src/app/page.tsx", page, "utf8");
    console.log("Updated Hero Buttons via fallback.");
}