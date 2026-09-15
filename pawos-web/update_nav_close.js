const fs = require("fs");
let nav = fs.readFileSync("src/components/layout/Nav.tsx", "utf8");

// The target to replace
const target = `</svg>
                </button>
            </div>
  
            
            <div className="hidden items-center gap-6 md:flex">`;

// Add a closing </div> for the Left Group
const replacement = `</svg>
                </button>
            </div>
            </div> {/* End Left Group */}
  
            
            <div className="hidden items-center gap-6 md:flex">`;

// If regex replace doesn't work perfectly due to whitespace, we can do it more reliably.
nav = nav.replace(/<\/button>\s*<\/div>\s*<div className="hidden items-center gap-6 md:flex">/, 
`</button>
            </div>
          </div>
  
          <div className="hidden items-center gap-6 md:flex">`);

fs.writeFileSync("src/components/layout/Nav.tsx", nav, "utf8");
console.log("Closed the left group div.");