// eslint-disable-next-line @typescript-eslint/no-var-requires
const path = require('path');

module.exports = {
  extends: '../.eslintrc',
  parserOptions: {
    project: path.resolve(__dirname, 'tsconfig.eslint.json'),
  },
};
