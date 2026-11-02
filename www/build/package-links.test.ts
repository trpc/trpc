import { fileURLToPath } from 'node:url';
import { NodeServices } from '@effect/platform-node';
import { describe, expect, it } from '@effect/vitest';
import { Effect, FileSystem, Path } from 'effect';

import { v11 } from '../src/site.ts';
import { docPages } from './content.ts';
import { fromDocusaurus } from './docusaurus-syntax.ts';
import { anchorsOf } from './markdown.ts';
import { samplesDir } from './paths.ts';

const packagesDir = fileURLToPath(new URL('../../packages', import.meta.url));
const contentDir = fileURLToPath(new URL('../v11/docs', import.meta.url));

/** Everything that names a trpc.io docs page, up to where a URL ends. */
const docsLink = /(?:https?:\/\/)?(?:www\.)?trpc\.io\/docs[^\s'"`)>\]},]*/g;
const canonical = /^https:\/\/trpc\.io(\/docs[^#]*)(?:#(.+))?$/;

/**
 * Links in runtime error messages to the query handles page, which isn't
 * published yet. Remove them from here when it is.
 */
const unpublished = new Set([
  'https://trpc.io/docs/client/tanstack-react-query/handles#in-render',
  'https://trpc.io/docs/client/tanstack-react-query/handles#where-handles-dont-work',
]);

/** Each `trpc.io/docs` link in the published packages' sources, by file and line. */
const packageLinks = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const files = yield* fs.glob('*/src/**/*.{ts,tsx}', { root: packagesDir });
  const found = yield* Effect.forEach(files.toSorted(), (file) =>
    Effect.map(fs.readFileString(path.join(packagesDir, file)), (source) =>
      source.split('\n').flatMap((line, index) =>
        [...line.matchAll(docsLink)].map((match) => ({
          at: `packages/${file}:${index + 1}`,
          url: match[0].replace(/[.:;]+$/, ''),
        })),
      ),
    ),
  );
  return found.flat();
});

/** The v11 pages trpc.io serves, by path, with their headings' ids. */
const servedPages = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const pages = yield* docPages({
    basePath: v11.basePath,
    contentDir,
    firstDoc: v11.firstDoc,
    samplesDir,
  });
  return new Map(
    yield* Effect.forEach(pages, (page) =>
      fs.readFileString(path.join(contentDir, `${page.slug}.md`)).pipe(
        Effect.flatMap((raw) =>
          anchorsOf(
            fromDocusaurus(raw.replace(/^---\n[\s\S]*?\n---\n/, ''), true)
              .markdown,
          ),
        ),
        Effect.map((anchors) => [page.path, new Set(anchors)] as const),
      ),
    ),
  );
});

describe('packages/*/src', () => {
  it.effect('links only to v11 docs pages and headings that exist', () =>
    Effect.gen(function* () {
      const links = yield* packageLinks;
      const pages = yield* servedPages;
      const problems = links.flatMap(({ at, url }) => {
        if (unpublished.has(url)) {
          return [];
        }
        const match = canonical.exec(url);
        if (!match?.[1]) {
          return [`${at}: ${url} isn't https://trpc.io/docs/<page>`];
        }
        const [, pagePath, hash] = match;
        const anchors = pages.get(pagePath.replace(/\/$/, '') || '/docs');
        if (anchors === undefined) {
          return [`${at}: ${url} isn't a v11 docs page`];
        }
        if (hash !== undefined && !anchors.has(hash)) {
          return [`${at}: ${url} has no #${hash} heading`];
        }
        return [];
      });
      expect(links.length).toBeGreaterThan(0);
      expect(problems).toEqual([]);
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});
