// prisma clients must all be different instances
function readPackage(pkg) {
  const prismaClientVersion = pkg.dependencies['@prisma/client'];
  if (prismaClientVersion) {
    // remove caret ^ from version (^2.0.0 -> 2.0.0)
    const version = prismaClientVersion.replace('^', '');

    pkg.dependencies[
      '@prisma/client'
    ] = `https://registry.npmjs.com/@prisma/client/-/client-${version}.tgz?id=${encodeURIComponent(
      pkg.name,
    )}`;
  }

  return pkg;
}

module.exports = {
  hooks: {
    readPackage,
  },
};
