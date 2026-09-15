const fs = require("fs");

let nav = fs.readFileSync("src/components/layout/Nav.tsx", "utf8");

// We need to add state for searchOpen
if (!nav.includes("const [searchOpen, setSearchOpen] = useState(false);")) {
    nav = nav.replace('const [activeMenu, setActiveMenu] = useState<string | null>(null);', 
        'const [activeMenu, setActiveMenu] = useState<string | null>(null);\n  const [searchOpen, setSearchOpen] = useState(false);\n  const [searchQuery, setSearchQuery] = useState("");\n  const [recentSearches, setRecentSearches] = useState(["linux download", "documentation", "pricing"]);');
}

// Replace the search button with a toggle that changes icon
const oldSearchBtn = `<button onClick={() => alert("Search functionality coming soon")} className="ml-4 text-neutral-400 hover:text-white transition p-2" aria-label="Search">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
              </button>`;
const newSearchBtn = `<button onClick={() => { setSearchOpen(!searchOpen); setActiveMenu(null); }} className="ml-4 text-neutral-400 hover:text-white transition p-2" aria-label="Search">
                {searchOpen ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                )}
              </button>`;
nav = nav.replace(oldSearchBtn, newSearchBtn);
nav = nav.replace(oldSearchBtn.replace(/\n/g, '\r\n'), newSearchBtn); // Handle potential CRLF

// Add the search overlay component just below the desktop dropdown canvas
const dropdownCanvasMatch = `</div>
        </div>

        {/* Mobile Full Screen Menu */}`;

const searchOverlay = `</div>
        </div>

        {/* Search Overlay Canvas */}
        <div 
          className={\`hidden md:flex absolute left-0 right-0 bg-black border-b border-neutral-900 overflow-hidden transition-all duration-300 origin-top justify-center \${
            searchOpen ? "opacity-100 h-[calc(100vh-73px)] py-16" : "opacity-0 max-h-0 py-0 border-b-0"
          }\`}
        >
          <div className="w-full max-w-3xl px-6 flex flex-col">
            <div className="relative border-b border-neutral-800 pb-4 mb-8">
              <input 
                type="text" 
                placeholder="Ask about PawOS..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-transparent text-3xl font-medium text-white placeholder-neutral-600 focus:outline-none"
                autoFocus={searchOpen}
              />
              <div className="absolute right-0 top-0 text-neutral-500">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
              </div>
            </div>

            {!searchQuery ? (
              <div className="flex flex-col gap-6">
                <div>
                  <h3 className="text-sm font-medium text-neutral-500 mb-4">Recent searches</h3>
                  <ul className="space-y-3">
                    {recentSearches.map((term, i) => (
                      <li key={i} className="group flex items-center justify-between">
                        <button onClick={() => setSearchQuery(term)} className="text-lg text-neutral-300 hover:text-white transition">
                          {term}
                        </button>
                        <button onClick={() => setRecentSearches(prev => prev.filter(t => t !== term))} className="text-neutral-600 hover:text-neutral-400 opacity-0 group-hover:opacity-100 transition" aria-label="Remove recent search">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-8">
                <div>
                  <h3 className="text-sm font-medium text-neutral-500 mb-4">Sources</h3>
                  
                  {searchQuery.toLowerCase().includes("linux") ? (
                    <div className="space-y-6">
                      <div>
                        <div className="text-xs font-medium text-neutral-400 mb-1">Page</div>
                        <Link href="https://revantaai.com/downloads/pawos-linux.AppImage" className="text-lg text-white hover:underline block mb-1">
                          PawOS for Linux Download | Revanta AI
                        </Link>
                        <p className="text-sm text-neutral-400">Download the AppImage for Linux users to experience the PawOS desktop environment.</p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <div>
                        <div className="text-xs font-medium text-neutral-400 mb-1">Page</div>
                        <Link href="/docs" className="text-lg text-white hover:underline block mb-1">
                          PawOS Documentation
                        </Link>
                        <p className="text-sm text-neutral-400">Learn how to install, configure, and use PawOS in your local environment.</p>
                      </div>
                      <div>
                        <div className="text-xs font-medium text-neutral-400 mb-1">Integration</div>
                        <Link href="/docs/integrations" className="text-lg text-white hover:underline block mb-1">
                          Supported Workflows
                        </Link>
                        <p className="text-sm text-neutral-400">View the list of natively supported integrations including GitHub, Jira, and Linear.</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Mobile Full Screen Menu */}`;

if (nav.includes("Mobile Full Screen Menu")) {
    nav = nav.replace(dropdownCanvasMatch, searchOverlay);
    // Add close logic for mobile overlay when search opens, etc.
}

// Ensure background backdrop also applies when searchOpen is true
nav = nav.replace('className={`absolute inset-0 h-screen w-screen bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${activeMenu ?',
    'className={`absolute inset-0 h-screen w-screen bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${activeMenu || searchOpen ?');

fs.writeFileSync("src/components/layout/Nav.tsx", nav, "utf8");
console.log("Search functionality implemented.");