// prisma clients must all be different instances
function readPackage(pkg) {
  const prismaClientVersion = pkg.dependencies['@prisma/client'];
  if (prismaClientVersion) {
    // remove caret ^ from version
    const version = prismaClientVersion.replace('^', '');

    pkg.dependencies = {
      ...pkg.dependencies,
      '@prisma/client': `https://registry.npmjs.com/@prisma/client/-/client-${version}.tgz?id=${encodeURIComponent(
        pkg.name,
      )}`,
    };
  }

  return pkg;
}

module.exports = {
  hooks: {
    readPackage,
  },
};
