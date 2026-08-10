const path = require('path');

module.exports = {
  target: 'electron-main',
  mode: 'production',
  // Two entries, one bundle each: `main` is the real Electron main process; `workers/*` are
  // standalone Node scripts launched via child_process.fork() (currently just
  // DependencyGraphWorker — Coding Runtime V2, Context Understanding Engine). A forked worker is
  // never loaded by Electron itself, so it must be its own complete bundle, not a lazy chunk of
  // main.js. `[name]` (a path with a slash, e.g. "workers/dependencyGraphWorker") makes webpack
  // create the matching subdirectory under dist/main/ automatically.
  entry: {
    main: './src/main/main.ts',
    'workers/dependencyGraphWorker': './src/main/execution/dependencyGraph/DependencyGraphWorker.ts',
  },
  devtool: 'source-map',
  output: {
    path: path.resolve(__dirname, 'dist/main'),
    filename: '[name].js',
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js'],
  },
  // sharp ships a real native (.node) binary per-platform — webpack cannot
  // statically bundle it like a pure-JS dependency, so it's left as a
  // literal runtime require() resolved from node_modules on disk instead
  // (same reason pdf-parse/mammoth/etc. work unbundled today, but those are
  // pure JS; sharp is the first genuinely native module a plugin uses).
  // docx bundles a browserify-style embedded copy of jszip whose internal
  // module loader contains a two-argument require(id, true) fallback path
  // (dead at runtime — only reachable if jszip's own internal module map
  // were missing an entry it always provides) that webpack's static
  // analyzer can't parse and treats as a hard build error. Left unbundled
  // and resolved from node_modules at runtime instead, same as sharp.
  // xlsx (SheetJS) feature-detects Node's fs via `typeof require !==
  // 'undefined' && require('fs')` at module load — real Node behavior,
  // but webpack's bundling breaks that detection so XLSX.readFile throws
  // "Cannot access file" even when the file genuinely exists. Left
  // unbundled for the same reason as sharp/docx above.
  // typescript ships its own large, already-optimized CJS bundle (lib/typescript.js) — bundling it
  // a second time through webpack buys nothing and meaningfully bloats both the main and worker
  // outputs, so it's left unbundled and resolved from node_modules at runtime, same as
  // sharp/docx/xlsx below (it moved from devDependencies to a real dependency in package.json so
  // electron-builder actually ships it in the packaged app's node_modules).
  externals: {
    sharp: 'commonjs sharp',
    docx: 'commonjs docx',
    xlsx: 'commonjs xlsx',
    typescript: 'commonjs typescript',
  },
  module: {
    rules: [
      {
        test: /\.(ts|tsx)$/,
        use: {
          loader: 'ts-loader',
          options: { transpileOnly: true, configFile: 'tsconfig.main.json' },
        },
        exclude: /node_modules/,
      },
    ],
  },
};
