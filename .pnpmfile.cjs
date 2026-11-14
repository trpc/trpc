// @hey-api/openapi-ts generates code with TypeScript's JS API, which
// TypeScript 7 doesn't have. Its typescript peer would resolve to the
// workspace's TypeScript 7, so give it TypeScript 6 of its own instead.
// @trpc/openapi only uses it in tests.
module.exports = {
  hooks: {
    readPackage(pkg) {
      if (pkg.name === '@hey-api/openapi-ts') {
        delete pkg.peerDependencies?.typescript;
        pkg.dependencies = { ...pkg.dependencies, typescript: '^6.0.3' };
      }
      return pkg;
    },
  },
};
