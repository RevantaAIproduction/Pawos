const fs = require("fs");
let nav = fs.readFileSync("src/components/layout/Nav.tsx", "utf8");

// We need to wrap the Logo Link and the NAV_ITEMS div in a single flex container.
// Currently it looks like:
// <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6">
//   <Link href="/" className="flex items-center gap-3 font-semibold text-xl tracking-tight text-white" aria-label="PawOS home">...
//   </Link>
//
//   <div className="hidden items-center md:flex h-full">...

const startTarget = `<nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6">`;
const replacementStart = `<nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6">
          {/* Left Group: Logo + Nav Items */}
          <div className="flex items-center gap-10">`;

const endTarget = `</svg>
              </button>
          </div>`;
const replacementEnd = `</svg>
              </button>
          </div>
          </div>`;

// Apply replacements
if (nav.includes(startTarget)) {
    nav = nav.replace(startTarget, replacementStart);
    // Find the end of the middle div
    nav = nav.replace(endTarget, replacementEnd);
    fs.writeFileSync("src/components/layout/Nav.tsx", nav, "utf8");
    console.log("Updated structure successfully.");
} else {
    console.log("Could not find start target.");
}