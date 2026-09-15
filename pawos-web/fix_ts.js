const fs = require("fs");
let content = fs.readFileSync("src/app/support/contact/ContactForm.tsx", "utf8");
content = content.replace("let targetEmail = CONTACT_EMAILS.hello;", "let targetEmail: string = CONTACT_EMAILS.hello;");
fs.writeFileSync("src/app/support/contact/ContactForm.tsx", content, "utf8");
console.log("Fixed TypeScript error.");