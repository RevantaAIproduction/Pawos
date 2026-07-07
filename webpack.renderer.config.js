const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = {
  target: 'electron-renderer',
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
            modules: true,
          },
        },
      ],
    },

    {
      test: /\.css$/,
      exclude: /\.module\.css$/,
      use: ['style-loader', 'css-loader'],
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

