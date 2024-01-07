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

// const coreReExportSnippet = `
// /**
//  * This file is here to make TypeScript happy and prevent _"The inferred type of 'createContext' cannot be named without a reference to [...]"_.
//  *
//  * We're basically just re-exporting everything from @trpc/core here.
//  *
//  * If you need to import anything from here, please open an issue at https://github.com/trpc/trpc/issues
//  */

// export * from '@trpc/core';
// export * from '@trpc/core/http';
// export * from '@trpc/core/rpc';
// `.trimStart();

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

  // const dirname = path.basename(path.dirname(pkgJsonPath));
  // if (dirname !== 'core') {
  //   // Adds a re-export of `@trpc/core` to all packages except `core`
  //   const coreReExport = 'src/unstableDoNotImportThis.ts';
  //   inputs.push(coreReExport);
  //   writeFileSyncRecursive(path.resolve(coreReExport), coreReExportSnippet);
  // }

  // Added to turbo.json pipeline output to ensure cache works
  const scriptOutputs = new Set<string>();
  scriptOutputs.add('package.json');

  /** Parse the inputs to get the user-import-paths, e.g.
   *  src/adapters/aws-lambda/index.ts -> adapters/aws-lambda
   *  src/adapters/express.ts -> adapters/express
   *
   *  Also, write to the package.json exports field, e.g.
   *  src/adapters/aws-lambda/index.ts -> exports['adapters/aws-lambda'] = { import: './dist/adapters/aws-lambda/index.mjs', ... }
   *  src/adapters/express.ts -> exports['adapters/express'] = { import: './dist/adapters/express.mjs', ... }
   */
  inputs
    .filter((str) => str !== 'src/index.ts') // index included by default above
    .map((str) => {
      // first, exclude 'src' part of the path
      const parts = str.split('/').slice(1);
      const pathWithoutSrc = parts.join('/');

      // if filename is index.ts, importPath is path until index.ts,
      // otherwise, importPath is the path without the file extension
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const importPath = ['index.ts', '_export.ts'].includes(parts.at(-1)!)
        ? parts.slice(0, -1).join('/')
        : pathWithoutSrc.replace(/\.ts$/, '');

      return {
        pathWithoutSrc,
        importPath,
      };
    })
    // sort them alphabetically
    .sort((a, b) => a.importPath.localeCompare(b.importPath))
    .forEach((paths) => {
      const { pathWithoutSrc, importPath } = paths;

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
  const formattedPkgJson = prettier.format(JSON.stringify(pkgJson), {
    parser: 'json-stringify',
    ...(await prettier.resolveConfig(pkgJsonPath)),
  });
  fs.writeFileSync(pkgJsonPath, formattedPkgJson, 'utf8');

  const turboPath = path.resolve('turbo.json');
  const turboJson = JSON.parse(fs.readFileSync(turboPath, 'utf8'));
  turboJson.pipeline['codegen-entrypoints'].outputs = [...scriptOutputs];
  const formattedTurboJson = prettier.format(JSON.stringify(turboJson), {
    parser: 'json',
    ...(await prettier.resolveConfig(turboPath)),
  });
  fs.writeFileSync(turboPath, formattedTurboJson, 'utf8');
}
