const Webpack = require("webpack");
const ExtractTextPlugin = require("extract-text-webpack-plugin");
const CleanPlugin = require("clean-webpack-plugin");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const UglifyJsPlugin = require("uglifyjs-webpack-plugin");

const path = require("path");

const join = (...paths) => path.join(__dirname, ...paths);

module.exports = {
  resolve: {
    extensions: [".js", ".css"],
    modules: ["src", "node_modules"],
  },
  entry: {
    "style.css": join("src", "css", "style.css"),
  },
  output: {
    filename: "[name]",
    path: join("static/assets"),
    publicPath: "",
  },
  performance: {
    hints: false,
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: "babel-loader",
          options: {
            presets: ["@babel/preset-env"],
          },
        },
      },
      {
        test: /\.(png|jpg|woff|woff2|ttf|eot|svg)$/,
        use: [
          {
            loader: "url-loader",
            options: {
              limit: 8192,
            },
          },
        ],
      },
      {
        test: /\.css$/,
        use: ExtractTextPlugin.extract({
          fallback: "style-loader",
          use: [
            {
              loader: "css-loader",
              options: {
                minimize: true,
                modules: true,
                importLoaders: 1,
                localIdentName: "[local]",
              },
            },
            {
              loader: "postcss-loader",
              options: {
                config: {
                  path: "postcss.config.js",
                },
              },
            },
          ],
        }),
      },
    ],
  },
  optimization: {
    splitChunks: {
      name: "vendor",
      minChunks: 2,
    },
    minimizer: [
      new UglifyJsPlugin({
        sourceMap: true,
      }),
    ],
  },
  plugins: [new CleanPlugin(join("static/assets")), new ExtractTextPlugin("[name]")],
};
