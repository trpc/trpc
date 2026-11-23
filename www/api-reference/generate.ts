/**
 * Generates the v11 API reference that trpc.io serves under `/docs/typedoc`,
 * with the TypeDoc, typedoc-plugin-markdown and typedoc-docusaurus-theme
 * versions and options its Docusaurus site used, so every page keeps its URL
 * (`/docs/typedoc/server/index/functions/initTRPC`). The raw output goes to
 * `out/`, then `convert.ts` turns it into pages of the site under
 * `../v11/docs/typedoc`, which git ignores: `pnpm build` regenerates them.
 *
 * TypeDoc needs TypeScript's JavaScript API, which TypeScript 7 doesn't
 * have, so this package pins TypeScript 5.9 for itself.
 */
import { readFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Application, TSConfigReader, TypeDocReader } from 'typedoc';

import { convertReference } from './convert.ts';

/** The packages, in the order the sidebar lists them. */
export const referencePackages = [
  'server',
  'client',
  'react-query',
  'tanstack-react-query',
  'next',
] as const;

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const packagesDir = here('../../packages');
const outDir = here('out');

interface ExportEntry {
  readonly import: { readonly default: string };
}

/** The entry points of a package's `exports`, as trpc.io documented them. */
function entryPoints(directory: string): ReadonlyArray<string> {
  const pkg = JSON.parse(
    readFileSync(`${packagesDir}/${directory}/package.json`, 'utf8'),
  ) as { exports: Record<string, ExportEntry | string> };
  return Object.values(pkg.exports)
    .flatMap((value) => (typeof value === 'string' ? [] : [value]))
    .map((value) =>
      value.import.default.replace('./dist/', '').replace('.mjs', '.ts'),
    )
    .filter((entry) => {
      if (entry.includes('unstable')) {
        return false;
      }
      switch (directory) {
        case 'next':
          return entry === 'index.ts';
        case 'server':
          // `shared.ts` only re-exports, deprecated.
          return entry !== 'shared.ts';
        default:
          return true;
      }
    });
}

async function generate(directory: string) {
  const app = await Application.bootstrapWithPlugins(
    {
      entryPoints: entryPoints(directory).map(
        (entry) => `${packagesDir}/${directory}/src/${entry}`,
      ),
      excludeExternals: true,
      excludeInternal: true,
      excludePrivate: true,
      excludeProtected: true,
      out: `${outDir}/${directory}`,
      parametersFormat: 'table',
      plugin: ['typedoc-plugin-markdown', 'typedoc-docusaurus-theme'],
      readme: 'none',
      skipErrorChecking: true,
      sourceLinkTemplate:
        'https://github.com/trpc/trpc/blob/{gitRevision}/{path}#L{line}',
      tsconfig: `${packagesDir}/${directory}/tsconfig.build.json`,
      // @ts-expect-error typedoc-docusaurus-theme's option
      sidebar: { autoConfiguration: true, pretty: true },
    },
    [new TypeDocReader(), new TSConfigReader()],
  );
  const project = await app.convert();
  if (!project) {
    throw new Error(`TypeDoc couldn't convert @trpc/${directory}`);
  }
  await app.generateOutputs(project);
}

if (import.meta.main) {
  rmSync(outDir, { force: true, recursive: true });
  for (const directory of referencePackages) {
    await generate(directory);
  }
  const written = convertReference({
    from: outDir,
    packages: referencePackages,
    to: here('../v11/docs/typedoc'),
  });
  console.log(`Wrote ${written} API reference pages.`);
}
