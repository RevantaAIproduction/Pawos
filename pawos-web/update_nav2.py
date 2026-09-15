import os

nav_path = "src/components/layout/Nav.tsx"
with open(nav_path, "r", encoding="utf-8") as f:
    nav = f.read()

# Move search button from Actions to NavItems, and change to icon
search_button_old = """<button className="text-sm font-medium text-neutral-400 hover:text-white transition" onClick={() => alert("Search functionality coming soon")}>
              Search
            </button>"""

nav = nav.replace(search_button_old, "")

search_icon = """<button onClick={() => alert("Search functionality coming soon")} className="ml-4 text-neutral-400 hover:text-white transition p-2" aria-label="Search">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
              </button>"""

# Insert search_icon after NAV_ITEMS.map inside the hidden md:flex h-full div
nav = nav.replace("</button>\n            ))}\n          </div>", "</button>\n            ))}\n            " + search_icon + "\n          </div>")

# Replace desktop download button
desktop_download_old = """<Link href="https://revantaai.com/downloads/pawos-windows.exe" className="text-sm font-medium text-white transition hover:opacity-80">
              Download for Windows &#8599;
            </Link>"""
desktop_download_new = """<button onClick={() => alert("PawOS for Windows is coming soon! Please check back later to be notified.")} className="text-sm font-medium text-white transition hover:opacity-80">
              Download for Windows &#8599;
            </button>"""
nav = nav.replace(desktop_download_old, desktop_download_new)

# Replace mobile download button
mobile_download_old = """<Link href="https://revantaai.com/downloads/pawos-windows.exe" className="text-xl font-medium text-white" onClick={() => setMobileOpen(false)}>
                  Download for Windows &#8599;
                </Link>"""
mobile_download_new = """<button onClick={() => { alert("PawOS for Windows is coming soon! Please check back later to be notified."); setMobileOpen(false); }} className="text-xl font-medium text-white text-left">
                  Download for Windows &#8599;
                </button>"""
nav = nav.replace(mobile_download_old, mobile_download_new)

# Also check for empty lines in the actions div and clean up if needed
with open(nav_path, "w", encoding="utf-8") as f:
    f.write(nav)

print("Nav updated.")