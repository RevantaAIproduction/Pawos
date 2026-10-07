// Bundles the CLI (and the shared PawOS client code it imports from ../pawos-shared) into the one
// file npm installs as the `pawos` command. The credential-store library is a native module, so it
// stays a normal dependency and is loaded at run time.
import { build } from "esbuild";

await build({
  entryPoints: ["src/index.ts"],
  outfile: "dist/pawos.js",
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  external: ["@napi-rs/keyring"],
  banner: { js: "#!/usr/bin/env node" },
  legalComments: "none",
  logLevel: "info",
});
