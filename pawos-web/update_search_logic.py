import os
import re

nav_path = "src/components/layout/Nav.tsx"
with open(nav_path, "r", encoding="utf-8") as f:
    content = f.read()

# We will inject SEARCH_INDEX above the Nav component
search_index_code = """
const SEARCH_INDEX = [
  { title: "PawOS Home", url: "/", type: "Page", desc: "The AI companion that gets work done." },
  { title: "About Revanta AI", url: "/about", type: "Page", desc: "The story of PawOS, why it exists, and how it works." },
  { title: "Careers", url: "/careers", type: "Page", desc: "Join Revanta AI. Engineering philosophy and open roles." },
  { title: "Contact Support", url: "/support/contact", type: "Page", desc: "Reach the Revanta AI team for support, technical questions, or sales." },
  { title: "Documentation", url: "/docs", type: "Resource", desc: "Learn how to install, configure, and use PawOS in your local environment." },
  { title: "Integrations Overview", url: "/docs/integrations", type: "Resource", desc: "View the list of natively supported integrations." },
  { title: "GitHub Integration", url: "/docs/integrations/github", type: "Plugin", desc: "Connect PawOS to GitHub to manage pull requests, issues, and repositories." },
  { title: "Jira Integration", url: "/docs/integrations/jira", type: "Plugin", desc: "Manage Jira tickets, sprints, and agile workflows through PawOS." },
  { title: "Linear Integration", url: "/docs/integrations/linear", type: "Plugin", desc: "Sync issues and project tracking with Linear." },
  { title: "FAQ", url: "/faq", type: "Resource", desc: "Frequently asked questions about PawOS and Revanta AI." },
  { title: "Changelog", url: "/changelog", type: "Resource", desc: "Latest updates, features, and fixes for PawOS." },
  { title: "Roadmap", url: "/roadmap", type: "Resource", desc: "Upcoming features and the long-term vision for PawOS." },
  { title: "Trust & Security", url: "/trust", type: "Page", desc: "Learn about how PawOS handles your data safely and securely." },
  { title: "Linux Download (AppImage)", url: "https://revantaai.com/downloads/pawos-linux.AppImage", type: "Download", desc: "Download the AppImage for Linux users to experience the PawOS desktop environment." }
];

export function Nav({ userEmail }: { userEmail: string | null }) {
"""

if "const SEARCH_INDEX =" not in content:
    content = content.replace("export function Nav({ userEmail }: { userEmail: string | null }) {", search_index_code)

# Let's replace the state variables and add effects
old_state = """  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [recentSearches, setRecentSearches] = useState(["linux download", "documentation", "pricing"]);
  const [mobileOpen, setMobileOpen] = useState(false);"""

new_state = """  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSearchQuery, setActiveSearchQuery] = useState("");
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("pawos_recent_searches");
      if (stored) setRecentSearches(JSON.parse(stored));
    } catch (e) {}
  }, []);

  const executeSearch = (query: string) => {
    const trimmed = query.trim();
    if (!trimmed) return;
    setActiveSearchQuery(trimmed);
    setSearchQuery(trimmed);
    
    const newRecents = [trimmed, ...recentSearches.filter(t => t !== trimmed)].slice(0, 5);
    setRecentSearches(newRecents);
    try {
      localStorage.setItem("pawos_recent_searches", JSON.stringify(newRecents));
    } catch (e) {}
  };

  const handleRemoveRecent = (term: string) => {
    const newRecents = recentSearches.filter(t => t !== term);
    setRecentSearches(newRecents);
    try {
      localStorage.setItem("pawos_recent_searches", JSON.stringify(newRecents));
    } catch (e) {}
  };

  const searchResults = activeSearchQuery 
    ? SEARCH_INDEX.filter(item => 
        item.title.toLowerCase().includes(activeSearchQuery.toLowerCase()) || 
        item.desc.toLowerCase().includes(activeSearchQuery.toLowerCase()) ||
        item.type.toLowerCase().includes(activeSearchQuery.toLowerCase())
      )
    : [];"""

if "const [activeSearchQuery" not in content:
    content = content.replace(old_state, new_state)
    
# Replace the Search Overlay Canvas content
# We will use regex to find the Search Overlay Canvas block and replace everything inside it.
overlay_regex = re.compile(r'({/\* Search Overlay Canvas \*/}.*?<div className="w-full max-w-3xl px-6 flex flex-col">).*?({/\* Mobile Full Screen Menu \*/})', re.DOTALL)

new_overlay_inner = r"""\1
            <h2 className="text-4xl font-medium text-neutral-600 mb-8 transition-opacity duration-300">Ask about PawOS</h2>
            
            <div className="relative border-b border-neutral-800 pb-4 mb-8 group">
              <span className="absolute -top-6 left-0 text-xs font-medium text-neutral-500">Your search</span>
              <input 
                type="text" 
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  if (e.target.value === "") setActiveSearchQuery("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") executeSearch(searchQuery);
                }}
                className="w-full bg-transparent text-4xl font-medium text-white placeholder-neutral-800 focus:outline-none"
                autoFocus={searchOpen}
              />
              <div onClick={() => executeSearch(searchQuery)} className="absolute right-0 top-1 text-neutral-400 bg-neutral-800 p-2 rounded-full cursor-pointer hover:bg-neutral-700 hover:text-white transition">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
              </div>
            </div>

            {!activeSearchQuery ? (
              <div className="flex flex-col gap-6">
                {recentSearches.length > 0 ? (
                  <div>
                    <h3 className="text-sm font-medium text-neutral-500 mb-4">Recent searches</h3>
                    <ul className="space-y-3">
                      {recentSearches.map((term, i) => (
                        <li key={i} className="group flex items-center justify-between">
                          <button onClick={() => executeSearch(term)} className="text-xl font-medium text-neutral-300 hover:text-white transition">
                            {term}
                          </button>
                          <button onClick={() => handleRemoveRecent(term)} className="text-neutral-500 hover:text-white opacity-0 group-hover:opacity-100 transition" aria-label="Remove recent search">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <div className="text-neutral-600 text-xl font-light mt-4">
                    Search for documentation, plugins, downloads, and more...
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-8 h-full overflow-y-auto pb-12">
                <div>
                  <h3 className="text-sm font-medium text-neutral-500 mb-6 border-b border-neutral-900 pb-2">
                    {searchResults.length > 0 ? "Sources" : "No results found"}
                  </h3>
                  
                  <div className="space-y-8">
                    {searchResults.map((result, i) => (
                      <div key={i} className="pt-2">
                        <div className="text-sm font-medium text-neutral-400 mb-2">{result.type}</div>
                        <Link href={result.url} className="text-2xl font-medium text-white hover:underline block mb-2" onClick={() => setSearchOpen(false)}>
                          {result.title}
                        </Link>
                        <p className="text-base text-neutral-400">{result.desc}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        \2"""

content = overlay_regex.sub(new_overlay_inner, content)

# Check if useEffect is imported
if "useEffect" not in content[:200]:
    content = content.replace('import React, { useState } from "react";', 'import React, { useState, useEffect } from "react";')
    content = content.replace("import { useState } from 'react';", "import { useState, useEffect } from 'react';")
    content = content.replace('import { useState } from "react";', 'import { useState, useEffect } from "react";')
    if "import { usePathname } from" in content and "useEffect" not in content:
        content = 'import { useState, useEffect } from "react";\n' + content

with open(nav_path, "w", encoding="utf-8") as f:
    f.write(content)

print("Dynamic search implemented.")