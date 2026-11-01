import { NodeServices } from '@effect/platform-node';
import { describe, expect, it } from '@effect/vitest';
import { fileURLToPath } from 'node:url';
import { Effect, FileSystem, Path } from 'effect';

const srcDir = fileURLToPath(new URL('..', import.meta.url));

/** The files that may know the decisions pages exist. */
const allowed = new Set([
  'components/decisions.tsx',
  'components/doc-body.tsx',
  'content/decision-search.test.ts',
  'content/decision-search.ts',
  'content/decision-types.ts',
  'content/decisions.test.ts',
  'content/decisions.ts',
  'content/manifest.d.ts',
  'routeTree.gen.ts',
  'routes/v12.decisions.$slug.tsx',
  'routes/v12.decisions.index.tsx',
  'routes/v12.decisions.open.$slug.tsx',
  'site.ts',
]);

describe('the decisions pages', () => {
  it.effect(
    'are known only to their routes: no nav, search, sitemap or llms.txt code reaches them',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const files = (yield* fs.readDirectory(srcDir, { recursive: true }))
          .map((file) => file.split(path.sep).join('/'))
          .filter((file) => /\.tsx?$/.test(file));
        const leaks: Array<string> = [];
        for (const file of files) {
          const text = yield* fs.readFileString(path.join(srcDir, file));
          if (
            !allowed.has(file) &&
            /\/v12\/decisions|decisions\.basePath|content\/decisions|decisions-manifest|decision-types/.test(
              text,
            )
          ) {
            leaks.push(file);
          }
        }
        expect(leaks).toEqual([]);
      }).pipe(Effect.provide(NodeServices.layer)),
  );
});
