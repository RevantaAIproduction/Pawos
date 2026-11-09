#!/usr/bin/env node
import { readFile, mkdir, writeFile, chmod } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const templatePath = path.join(root, "scripts", "launcher.template.sh");

export function renderLauncher(template, version, appSha256) {
  if (!/^\d+\.\d+\.\d+(?:[-.][A-Za-z0-9.-]+)?$/.test(version)) throw new Error("Invalid Chronicle release version.");
  if (!/^[a-f0-9]{64}$/.test(appSha256)) throw new Error("The app archive needs a lowercase SHA-256 checksum.");
  const appUrl = `https://pawos.revantaai.com/chronicle/releases/v${version}/chronicle-${version}.tar.gz`;
  const output = template.replaceAll("@APP_VERSION@", version).replaceAll("@APP_SHA256@", appSha256).replaceAll("@APP_URL@", appUrl).replace(/\r\n/g, "\n");
  if (/@[A-Z_]+@/.test(output)) throw new Error("The launcher template has unreplaced values.");
  return output;
}

async function main(args) {
  const [version, appSha256, outputArg] = args;
  if (!version || !appSha256) throw new Error("Usage: node scripts/render-launcher.mjs VERSION APP_SHA256 [OUTPUT]");
  const output = outputArg ? path.resolve(outputArg) : path.join(root, "dist", "release", "run");
  const rendered = renderLauncher(await readFile(templatePath, "utf8"), version, appSha256);
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, rendered, { mode: 0o755 });
  await chmod(output, 0o755);
  console.log(`Rendered release launcher: ${output}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
