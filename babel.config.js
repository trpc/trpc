module.exports = {
  presets: [
    "@babel/preset-typescript",
    "@babel/preset-react",
    [
      '@babel/preset-env',
      {
        modules: false,
        loose: true,
        exclude: [
          "@babel/plugin-transform-async-to-generator",
          "@babel/plugin-transform-regenerator",
        ],
      },
    ],
  ],
  plugins: [
    "babel-plugin-annotate-pure-calls",
    "babel-plugin-dev-expression",
    ["@babel/plugin-proposal-class-properties", { loose: true }],
  ]
};
