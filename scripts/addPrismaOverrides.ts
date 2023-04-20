import fg from 'fast-glob';
import { readFile, writeFile } from 'fs/promises';
import path from 'path';
import prettier from 'prettier';
import type { PackageJson } from './entrypoints';

async function main() {
  const examples = await fg(
    [
      //
      'examples/*',
      'examples/.interop/*',
      'examples/.test/*',
    ],
    {
      onlyDirectories: true,
    },
  );

  const pkgRoot = path.join(process.cwd(), 'package.json');
  const rootPkgJson: PackageJson = JSON.parse(await readFile(pkgRoot, 'utf8'));

  await Promise.all(
    examples.map(async (example) => {
      const pkgJsonPath = path.join(example, 'package.json');

      let pkgJson: PackageJson;
      try {
        pkgJson = JSON.parse(await readFile(pkgJsonPath, 'utf8'));
      } catch (_) {
        return;
      }

      const prismaClientVersion = pkgJson.dependencies?.['@prisma/client'];
      if (prismaClientVersion) {
        const version = prismaClientVersion.replace('^', '');
        rootPkgJson.pnpm.overrides[
          `${pkgJson.name}>@prisma/client`
        ] = `https://registry.npmjs.com/@prisma/client/-/client-${version}.tgz?id=${encodeURIComponent(
          pkgJson.name.replace(/\/|@/g, ''), // remove @ and / before. vitest hiccups otherwise
        )}`;
        rootPkgJson.pnpm.overrides[
          `${pkgJson.name}>prisma`
        ] = `https://registry.npmjs.com/prisma/-/prisma-${version}.tgz?id=${encodeURIComponent(
          pkgJson.name.replace(/\//g, ''),
        )}`;
      }
    }),
  );

  const formattedPkgJson = prettier.format(JSON.stringify(rootPkgJson), {
    parser: 'json-stringify',
    printWidth: 80,
    endOfLine: 'auto',
  });

  await writeFile(pkgRoot, formattedPkgJson, 'utf8');
}

void main();
