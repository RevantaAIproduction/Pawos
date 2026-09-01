import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";
import pngToIcoModule from "png-to-ico";

const pngToIco = pngToIcoModule.default || pngToIcoModule;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(__dirname, "..", "public", "logo-icon.png");
const dest = path.join(__dirname, "..", "src", "app", "favicon.ico");

async function main() {
  const { width, height } = await sharp(src).metadata();
  const size = Math.max(width, height);

  const squared = await sharp(src)
    .resize(size, size, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  const buf = await pngToIco(squared);
  fs.writeFileSync(dest, buf);
  console.log("favicon.ico regenerated from logo-icon.png:", dest);
}

main().catch((err) => {
  console.error("favicon generation failed:", err);
  process.exit(1);
});
