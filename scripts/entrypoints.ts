import fs from 'fs';
import path from 'path';
import prettier from 'prettier';

// minimal version of PackageJson type necessary
export type PackageJson = {
  name: string;
  exports: Record<
    string,
    { import: string; require: string; default: string } | string
  >;
  files: string[];
  dependencies: Record<string, string>;
  pnpm: {
    overrides: Record<string, string>;
  };
  funding: string[];
};

// create directories on the way if they don't exist
function writeFileSyncRecursive(filePath: string, content: string) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, content, 'utf8');
}

export async function generateEntrypoints(rawInputs: string[]) {
  const inputs = [...rawInputs];
  // set some defaults for the package.json

  const pkgJsonPath = path.resolve('package.json');

  const pkgJson: PackageJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));

  pkgJson.files = ['dist', 'src', 'README.md'];
  pkgJson.exports = {
    './package.json': './package.json',
    '.': {
      import: './dist/index.mjs',
      require: './dist/index.js',
      default: './dist/index.js',
    },
  };

  // Added to turbo.json pipeline output to ensure cache works
  const scriptOutputs = new Set<string>();
  scriptOutputs.add('package.json');
  scriptOutputs.add('dist/**');

  /** Parse the inputs to get the user-import-paths, e.g.
   *  src/adapters/aws-lambda/index.ts -> adapters/aws-lambda
   *  src/adapters/express.ts -> adapters/express
   *
   *  Also, write to the package.json exports field, e.g.
   *  src/adapters/aws-lambda/index.ts -> exports['adapters/aws-lambda'] = { import: './dist/adapters/aws-lambda/index.mjs', ... }
   *  src/adapters/express.ts -> exports['adapters/express'] = { import: './dist/adapters/express.mjs', ... }
   */
  inputs
    .filter((i) => i !== 'src/index.ts') // index included by default above
    .sort()
    .forEach((i) => {
      // first, exclude 'src' part of the path
      const parts = i.split('/').slice(1);
      const pathWithoutSrc = parts.join('/');

      // if filename is index.ts, importPath is path until index.ts,
      // otherwise, importPath is the path without the file extension
      const importPath =
        parts.at(-1) === 'index.ts'
          ? parts.slice(0, -1).join('/')
          : pathWithoutSrc.replace(/\.(ts|tsx)$/, '');

      // write this entrypoint to the package.json exports field
      const esm = './dist/' + pathWithoutSrc.replace(/\.(ts|tsx)$/, '.mjs');
      const cjs = './dist/' + pathWithoutSrc.replace(/\.(ts|tsx)$/, '.js');
      pkgJson.exports[`./${importPath}`] = {
        import: esm,
        require: cjs,
        default: cjs,
      };

      // create the barrelfile, linking the declared exports to the compiled files in dist
      const importDepth = importPath.split('/').length || 1;

      // in windows, "path.join" uses backslashes, it leads escape characters
      const resolvedImport = [
        ...Array(importDepth).fill('..'),
        'dist',
        importPath,
      ].join('/');

      // index.js
      const indexFile = path.resolve(importPath, 'index.js');
      const indexFileContent = `module.exports = require('${resolvedImport}');\n`;
      writeFileSyncRecursive(indexFile, indexFileContent);

      // index.d.ts
      const typeFile = path.resolve(importPath, 'index.d.ts');
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

    if (topLevel !== 'package.json') scriptOutputs.add(topLevel + '/**');
  });

  // Exclude test files in builds
  pkgJson.files.push('!**/*.test.*');
  // Add `funding` in all packages
  pkgJson.funding = ['https://trpc.io/sponsor'];

  // write package.json
  const formattedPkgJson = await prettier.format(JSON.stringify(pkgJson), {
    parser: 'json-stringify',
    ...(await prettier.resolveConfig(pkgJsonPath)),
  });
  fs.writeFileSync(pkgJsonPath, formattedPkgJson, 'utf8');

  const turboPath = path.resolve('turbo.json');
  const turboJson = JSON.parse(fs.readFileSync(turboPath, 'utf8'));
  turboJson.tasks['codegen-entrypoints'].outputs = [...scriptOutputs];
  const formattedTurboJson = await prettier.format(JSON.stringify(turboJson), {
    parser: 'json',
    ...(await prettier.resolveConfig(turboPath)),
  });
  fs.writeFileSync(turboPath, formattedTurboJson, 'utf8');
}
