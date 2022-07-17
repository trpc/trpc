module.exports = {
  // FIXME: This should not be necessary and it is probably some underlying
  // issue somewhere in the monorepo that is causing it.
  parserOptions: { project: ['./tsconfig.json'] },
  extends: ['next'],
};
