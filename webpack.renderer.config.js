const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = {
  target: 'electron-renderer',
  // The 'electron-renderer' target auto-externalizes Node built-ins
  // (require('events') etc. left untouched, assuming Electron will supply
  // them) — correct only if nodeIntegration is on. This app's windows are
  // created with nodeIntegration:false (see main.ts), so any dependency
  // that needs a Node built-in (e.g. @supabase/realtime-js needs 'events')
  // would otherwise crash at runtime with "X is not defined". Disabling
  // just the auto-externalization lets webpack bundle the real userland
  // polyfill packages (e.g. the 'events' npm package) already in
  // node_modules instead.
  externalsPresets: { node: false },
  mode: 'production',
  entry: './src/renderer/index.tsx',
  devtool: 'source-map',
  output: {
    path: path.resolve(__dirname, 'dist/renderer'),
    filename: 'renderer.js',
    publicPath: '',
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js'],
  },
module: {
  rules: [
    {
      test: /\.(ts|tsx)$/,
      exclude: /node_modules/,
      use: {
        loader: 'ts-loader',
        options: {
          transpileOnly: true,
          configFile: 'tsconfig.renderer.json',
        },
      },
    },

    {
      test: /\.module\.css$/,
      use: [
        'style-loader',
        {
          loader: 'css-loader',
          options: {
            modules: {
              namedExport: false,
            },
          },
        },
      ],
    },

    {
      test: /\.css$/,
      exclude: /\.module\.css$/,
      use: ['style-loader', 'css-loader'],
    },

    {
      test: /\.(png|jpe?g|gif|svg)$/i,
      type: 'asset/resource',
      generator: { filename: 'images/[name].[hash][ext]' },
    },
  ],
},
  plugins: [
    new HtmlWebpackPlugin({
      template: './src/renderer/index.html',
      filename: 'index.html',
    }),
  ],
  devServer: {
    port: 3000,
    static: { directory: path.join(__dirname, 'dist/renderer') },
    hot: false,
    liveReload: true,
    devMiddleware: { writeToDisk: true },
  },
};
