const fs = require("fs");
let code = fs.readFileSync("src/components/HeroAnimation.tsx", "utf8");

const oldColors = `    vec3 color1 = vec3(0.02, 0.04, 0.12); // Deep space blue
    vec3 color2 = vec3(0.15, 0.35, 0.75); // Vibrant blue
    vec3 color3 = vec3(0.45, 0.25, 0.65); // Violet
    vec3 color4 = vec3(0.65, 0.5, 0.85);  // Lavender`;

const newColors = `    // Colors perfectly matched to the vibrant magenta/cyan request
    vec3 color1 = vec3(0.01, 0.02, 0.15); // Deep dark blue background
    vec3 color2 = vec3(0.0, 0.35, 1.0);   // Vibrant electric blue
    vec3 color3 = vec3(0.75, 0.05, 0.85); // Vivid magenta / neon purple
    vec3 color4 = vec3(0.0, 0.85, 1.0);   // Bright cyan for highlights`;

if (code.includes(oldColors)) {
    code = code.replace(oldColors, newColors);
    fs.writeFileSync("src/components/HeroAnimation.tsx", code, "utf8");
    console.log("Colors replaced successfully.");
} else {
    console.log("Could not find the exact color string. Need to inspect.");
}