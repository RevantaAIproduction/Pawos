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
  externals: {
    sharp: 'commonjs sharp',
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
