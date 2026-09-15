const fs = require("fs");
let code = fs.readFileSync("src/components/HeroAnimation.tsx", "utf8");

code = code.replace(/vec3 color1 = [^;]+;[^\n]*\n/, "vec3 color1 = vec3(0.01, 0.02, 0.15); // Deep dark blue\n");
code = code.replace(/vec3 color2 = [^;]+;[^\n]*\n/, "vec3 color2 = vec3(0.0, 0.35, 1.0); // Vibrant electric blue\n");
code = code.replace(/vec3 color3 = [^;]+;[^\n]*\n/, "vec3 color3 = vec3(0.75, 0.05, 0.85); // Vivid magenta\n");
code = code.replace(/vec3 color4 = [^;]+;[^\n]*\n/, "vec3 color4 = vec3(0.0, 0.85, 1.0); // Bright cyan\n");

fs.writeFileSync("src/components/HeroAnimation.tsx", code, "utf8");
console.log("Colors replaced via regex.");