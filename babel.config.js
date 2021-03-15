module.exports = {
  presets: [
    "@babel/preset-typescript",
    "@babel/preset-react",
    [
      "@babel/preset-env",
      {
        "useBuiltIns": "entry"
      }
    ],
  ],
  plugins: [
    "babel-plugin-annotate-pure-calls",
    "babel-plugin-dev-expression",
    ["@babel/plugin-proposal-class-properties", { loose: true }],
  ],
  babelrcRoots: [
    "packages/*"
  ]
};
