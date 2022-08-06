import fs from 'fs-extra';
import path from 'path';

const packagesDir = path.resolve(__dirname, '..', 'packages');
const packages = ['client', 'server', 'next', 'react'] as const;

// minimal version of PackageJson type necessary
type PackageJson = {
  exports: Record<string, { default: string }>;
};

function getEntrypoints(pkg: typeof packages[number]) {
  // get entrypoints from package.json
  const pkgJson = fs.readJSONSync(
    path.resolve(packagesDir, pkg, 'package.json'),
  ) as PackageJson;
  const exports = pkgJson.exports;

  /**
   * transform the exports field to <entrypoint, distpath> pairs,
   * where entrypoint is the file we need to generate, and distpath is the
   * path to the file that we need to export in the generated file.
   */
  const entrypoints = Object.entries(exports)
    .filter(([entryPoint]) => entryPoint !== '.')
    .map(([entrypoint, paths]) => {
      // distFile is relative to package root: ./dist/...
      const distFile = paths.default;

      // how deep the path is relative to package root: ./src/...
      const depth = entrypoint.split('/').length - 1;

      // traverse up the path to the package root
      const distPathRelativeEntrypoint = path.join(
        ...Array(depth).fill('..'),
        distFile,
      );

      // remove file extension for importing
      const parsed = path.parse(distPathRelativeEntrypoint);
      const importPath = `${parsed.dir}/${parsed.name}`;
      return [entrypoint, importPath] as const;
    });

  return entrypoints;
}

// create directories on the way if they dont exist
const writeFileSyncRecursive = (filePath: string, content: string) => {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, content);
};

for (const pkg of packages) {
  const pkgRoot = path.resolve(packagesDir, pkg);
  const entrypoints = getEntrypoints(pkg);

  for (const [entrypoint, importPath] of entrypoints) {
    // index.js
    const indexFile = path.resolve(pkgRoot, entrypoint, 'index.js');
    const indexFileContent = `module.exports = require('${importPath}');\n`;
    writeFileSyncRecursive(indexFile, indexFileContent);

    // index.d.ts
    const typePath = path.resolve(pkgRoot, entrypoint, 'index.d.ts');
    const typeContent = `export * from '${importPath}';\n`;
    writeFileSyncRecursive(typePath, typeContent);
  }
}
