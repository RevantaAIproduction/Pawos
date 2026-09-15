import re

with open('src/app/about/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Remove SECTION 15 & 16 & 17 entirely, leaving SECTION 18.
pattern = r"          \{\/\* SECTION 15 \& 16 \& 17.*?(?=          \{\/\* SECTION 18)"
new_content = re.sub(pattern, "", content, flags=re.DOTALL)

with open('src/app/about/page.tsx', 'w', encoding='utf-8') as f:
    f.write(new_content)

print("Removed duplicated roadmap section successfully.")