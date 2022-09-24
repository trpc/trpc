// prisma clients must all be different instances
let id = 0;
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

  let dependencies = {};
  if (pkg.dependencies.prisma) {
    dependencies = pkg.dependencies;
  } else if (pkg.devDependencies.prisma) {
    dependencies = pkg.devDependencies;
  }

  const prismaVersion = dependencies.prisma;
  if (prismaVersion) {
    const version = prismaVersion.replace('^', '');
    dependencies.prisma = `https://registry.npmjs.com/prisma/-/prisma-${version}.tgz?id=${encodeURIComponent(
      pkg.name,
    )}`;
  }

  const prismaEnginesVersion = pkg.dependencies['@prisma/engines'];
  if (prismaEnginesVersion) {
    pkg.dependencies[
      '@prisma/engines'
    ] = `https://registry.npmjs.com/@prisma/engines/-/engines-${prismaEnginesVersion}.tgz?id=${id}`;
    id += 1;
  }

  return pkg;
}

module.exports = {
  hooks: {
    readPackage,
  },
};
