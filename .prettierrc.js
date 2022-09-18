module.exports = {
  printWidth: 80,
  trailingComma: 'all',
  endOfLine: 'auto',
  singleQuote: true,
  importOrder: ['___', '__', '<THIRD_PARTY_MODULES>', '^[./]'],
  importOrderSortSpecifiers: true,
  plugins: [require.resolve('@trivago/prettier-plugin-sort-imports')],
};
