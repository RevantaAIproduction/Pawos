import os

nav_path = "src/components/layout/Nav.tsx"
with open(nav_path, "r", encoding="utf-8") as f:
    nav = f.read()

# Make the navbar background solid black instead of transparent
nav = nav.replace('bg-transparent', 'bg-black')

# Make the nav container edge-to-edge
nav = nav.replace('max-w-7xl', 'w-full')
nav = nav.replace('px-6 py-6', 'px-8 md:px-12 py-5')

# Ensure the gap between Logo and NavItems is larger to match the screenshot
nav = nav.replace('gap-10', 'gap-16 lg:gap-24')

with open(nav_path, "w", encoding="utf-8") as f:
    f.write(nav)

print("Updated navbar layout to be edge-to-edge and solid black.")