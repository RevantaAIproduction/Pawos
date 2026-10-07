// Bundles the extension (and the shared PawOS client code it imports from ../pawos-shared) into
// one file. `vscode` is provided by VS Code itself and is never bundled.
import { build } from "esbuild";

await build({
  entryPoints: ["src/extension.ts"],
  outfile: "out/extension.js",
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  external: ["vscode"],
  sourcemap: true,
  logLevel: "info",
});
