const fs = require("fs");
let nav = fs.readFileSync("src/components/layout/Nav.tsx", "utf8");

const searchOverlay = `
        {/* Search Overlay Canvas */}
        <div 
          className={\`hidden md:flex absolute left-0 right-0 bg-black border-b border-neutral-900 overflow-hidden transition-all duration-300 origin-top justify-center \${
            searchOpen ? "opacity-100 max-h-[1000px] py-16" : "opacity-0 max-h-0 py-0 border-b-0"
          }\`}
        >
          <div className="w-full max-w-3xl px-6 flex flex-col">
            <h2 className="text-4xl font-medium text-neutral-600 mb-8 transition-opacity duration-300">Ask about PawOS</h2>
            
            <div className="relative border-b border-neutral-800 pb-4 mb-8 group">
              <span className="absolute -top-6 left-0 text-xs font-medium text-neutral-500">Your search</span>
              <input 
                type="text" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-transparent text-4xl font-medium text-white placeholder-neutral-800 focus:outline-none"
                autoFocus={searchOpen}
              />
              <div className="absolute right-0 top-1 text-neutral-400 bg-neutral-800 p-2 rounded-full cursor-pointer hover:bg-neutral-700 transition">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
              </div>
            </div>

            {!searchQuery ? (
              <div className="flex flex-col gap-6">
                <div>
                  <h3 className="text-sm font-medium text-neutral-500 mb-4">Recent searches</h3>
                  <ul className="space-y-3">
                    {recentSearches.map((term, i) => (
                      <li key={i} className="group flex items-center justify-between">
                        <button onClick={() => setSearchQuery(term)} className="text-xl font-medium text-neutral-300 hover:text-white transition">
                          {term}
                        </button>
                        <button onClick={() => setRecentSearches(prev => prev.filter(t => t !== term))} className="text-neutral-500 hover:text-white opacity-0 group-hover:opacity-100 transition" aria-label="Remove recent search">
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-8">
                <div>
                  <h3 className="text-sm font-medium text-neutral-500 mb-6 border-b border-neutral-900 pb-2">Sources</h3>
                  
                  {searchQuery.toLowerCase().includes("linux") ? (
                    <div className="space-y-8">
                      <div>
                        <div className="text-sm font-medium text-neutral-400 mb-2">Page</div>
                        <Link href="https://revantaai.com/downloads/pawos-linux.AppImage" className="text-2xl font-medium text-white hover:underline block mb-2" onClick={() => setSearchOpen(false)}>
                          PawOS for Linux Download | Revanta AI
                        </Link>
                        <p className="text-base text-neutral-400">Download the AppImage for Linux users to experience the PawOS desktop environment.</p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-8">
                      <div>
                        <div className="text-sm font-medium text-neutral-400 mb-2">Page</div>
                        <Link href="/docs" className="text-2xl font-medium text-white hover:underline block mb-2" onClick={() => setSearchOpen(false)}>
                          PawOS Documentation
                        </Link>
                        <p className="text-base text-neutral-400">Learn how to install, configure, and use PawOS in your local environment.</p>
                      </div>
                      <div className="pt-4 border-t border-neutral-900">
                        <div className="text-sm font-medium text-neutral-400 mb-2">Plugin</div>
                        <Link href="/docs/integrations" className="text-2xl font-medium text-white hover:underline block mb-2" onClick={() => setSearchOpen(false)}>
                          Supported Workflows
                        </Link>
                        <p className="text-base text-neutral-400">View the list of natively supported integrations including GitHub, Jira, and Linear.</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Mobile Full Screen Menu */}`;

nav = nav.replace("{/* Mobile Full Screen Menu */}", searchOverlay);
fs.writeFileSync("src/components/layout/Nav.tsx", nav, "utf8");
console.log("Injected search overlay successfully.");