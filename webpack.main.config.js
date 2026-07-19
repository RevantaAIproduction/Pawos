const path = require('path');

module.exports = {
  target: 'electron-main',
  mode: 'production',
  entry: './src/main/main.ts',
  devtool: 'source-map',
  output: {
    path: path.resolve(__dirname, 'dist/main'),
    filename: 'main.js',
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
  externals: {
    sharp: 'commonjs sharp',
    docx: 'commonjs docx',
    xlsx: 'commonjs xlsx',
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
