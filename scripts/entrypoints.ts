import fs from 'fs-extra';
import path from 'path';
import { INPUTS, PACKAGES } from '../rollup.config';

const packagesDir = path.resolve(__dirname, '..', 'packages');

// minimal version of PackageJson type necessary
type PackageJson = {
  exports: Record<string, { import: string; require: string; default: string }>;
  files: string[];
};

// create directories on the way if they dont exist
function writeFileSyncRecursive(filePath: string, content: string) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, content);
}

// ACTUAL SCRIPT

for (const pkg of PACKAGES) {
  const pkgRoot = path.resolve(packagesDir, pkg);
  const inputs = INPUTS[pkg];

  // set some defaults for the package.json
  const pkgJson = fs.readJsonSync(
    path.resolve(pkgRoot, 'package.json'),
  ) as PackageJson;
  pkgJson.files = ['dist', 'src', 'README.md'];
  pkgJson.exports = {
    '.': {
      import: './dist/index.mjs',
      require: './dist/index.js',
      default: './dist/index.js',
    },
  };

  /** Parse the inputs to get the user-import-paths, e.g.
   *   src/adapters/aws-lambda/index.ts -> adapters/aws-lambda
   *   src/adapters/express.ts -> adapters/express
   *
   *  Also, write to the package.json exports field, e.g.
   *   src/adapters/aws-lambda/index.ts -> exports['adapters/aws-lambda'] = { import: './dist/adapters/aws-lambda/index.mjs', ... }
   *   src/adapters/express.ts -> exports['adapters/express'] = { import: './dist/adapters/express.mjs', ... }
   */
  inputs
    .filter((i) => i !== 'src/index.ts') // index included by default above
    .forEach((i) => {
      // first, exclude 'src' part of the path
      const parts = i.split('/').slice(1);
      const pathWithoutSrc = parts.join('/');

      // if filename is index.ts, importPath is path until index.ts,
      // otherwise, importPath is the path without the fileextension
      const importPath =
        parts.at(-1) === 'index.ts'
          ? parts.slice(0, -1).join('/')
          : pathWithoutSrc.replace(/\.ts$/, '');

      // write this entrypoint to the package.json exports field
      const esm = './dist/' + pathWithoutSrc.replace(/\.ts$/, '.mjs');
      const cjs = './dist/' + pathWithoutSrc.replace(/\.ts$/, '.js');
      pkgJson.exports[`./${importPath}`] = {
        import: esm,
        require: cjs,
        default: cjs,
      };

      // create the barrelfile, linking the declared exports to the compiled files in dist
      const importDepth = importPath.split('/').length || 1;
      const resolvedImport = path.join(
        ...Array(importDepth).fill('..'),
        'dist',
        importPath,
      );
      // index.js
      const indexFile = path.resolve(pkgRoot, importPath, 'index.js');
      const indexFileContent = `module.exports = require('${resolvedImport}');\n`;
      writeFileSyncRecursive(indexFile, indexFileContent);

      // index.d.ts
      const typeFile = path.resolve(pkgRoot, importPath, 'index.d.ts');
      const typeFileContent = `export * from '${resolvedImport}';\n`;
      writeFileSyncRecursive(typeFile, typeFileContent);
    });

  // write top-level directories to package.json 'files' field
  Object.keys(pkgJson.exports).forEach((entrypoint) => {
    // get the top-level directory of the entrypoint, e.g. 'adapters/aws-lambda' -> 'adapters'
    const topLevel = entrypoint.split('/')[1];

    if (!topLevel) return;
    if (pkgJson.files.includes(topLevel)) return;
    pkgJson.files.push(topLevel);
  });

  // write package.json
  fs.writeJsonSync(path.resolve(pkgRoot, 'package.json'), pkgJson);
}
