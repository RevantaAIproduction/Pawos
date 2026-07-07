const path = require('path');

module.exports = {
  target: 'electron-preload',
  mode: 'production',
  entry: './src/main/preload/preload.ts',
  devtool: 'source-map',
  output: {
    path: path.resolve(__dirname, 'dist/preload'),
    filename: 'preload.js',
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: {
          loader: 'ts-loader',
          options: { transpileOnly: true },
        },
        exclude: /node_modules/,
      },
    ],
  },
};

