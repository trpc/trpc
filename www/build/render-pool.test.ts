import { NodeServices } from '@effect/platform-node';
import { describe, expect, it } from '@effect/vitest';
import { Effect, FileSystem, Path } from 'effect';

import {
  releaseTwoslashers,
  renderMarkdown,
  type RenderOptions,
} from './markdown.ts';
import { makeRenderPool } from './render-pool.ts';

/** A samples dir whose `docs` app compiles inline blocks, and a cache dir, removed when the test ends. */
const dirs = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = yield* fs.makeTempDirectoryScoped({ prefix: 'render-pool-' });
  const app = path.join(root, 'samples/docs');
  yield* fs.makeDirectory(path.join(app, 'src'), { recursive: true });
  yield* fs.writeFileString(
    path.join(app, 'src/server.ts'),
    'export const greeting = "hello" as const;\n',
  );
  yield* fs.writeFileString(
    path.join(app, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        allowImportingTsExtensions: true,
        lib: ['es2022'],
        module: 'esnext',
        moduleResolution: 'bundler',
        noEmit: true,
        strict: true,
        types: [],
      },
      include: ['src'],
    }),
  );
  return {
    samplesDir: path.join(root, 'samples'),
    twoslashCache: {
      dir: path.join(root, 'cache'),
      lockfile: path.join(root, 'pnpm-lock.yaml'),
      tools: { dir: root, packages: [] },
    },
  };
});

const pool = Effect.acquireRelease(
  Effect.sync(() => makeRenderPool(2)),
  (renderers) => Effect.promise(renderers.close),
);

const page = [
  '# Greeting',
  '',
  '```ts twoslash',
  "import { greeting } from './server.ts';",
  'greeting;',
  '// ^?',
  '```',
].join('\n');

describe('makeRenderPool', () => {
  it.effect('renders a page as renderMarkdown does, in another process', () =>
    Effect.gen(function* () {
      const made = yield* dirs;
      const options: Omit<RenderOptions, 'twoslashCache'> = {
        basePath: '/docs',
        samplesDir: made.samplesDir,
        slug: 'greeting',
        sourceUrl: 'https://github.com/trpc/trpc/blob/v12/next',
      };
      const renderers = yield* pool;
      const [first, second] = yield* Effect.all(
        [
          renderers.render(page, options, made.twoslashCache),
          renderers.render(`${page}\n\nAgain.`, options, undefined),
        ],
        { concurrency: 'unbounded' },
      );
      const here = yield* renderMarkdown(page, options);
      releaseTwoslashers();
      expect(first.rendered).toEqual(here);
      expect(first.rendered.typeQueries).toEqual([
        ['(alias) const greeting: "hello"\nimport greeting'],
      ]);
      expect(first.stats).toEqual({ hits: 0, misses: 1 });
      expect(second.rendered.html).toContain('Again.');
      expect(second.stats).toEqual({ hits: 0, misses: 0 });
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect(
    'gives each page its own output when a page renders in parts, one after another',
    () =>
      Effect.gen(function* () {
        const made = yield* dirs;
        const renderers = yield* Effect.acquireRelease(
          Effect.sync(() => makeRenderPool(1)),
          (one) => Effect.promise(one.close),
        );
        const renderParts = (name: string) =>
          Effect.forEach(['one', 'two', 'three'], (part) =>
            Effect.map(
              renderers.render(
                `${name} ${part}`,
                {
                  basePath: '/docs',
                  samplesDir: made.samplesDir,
                  slug: name,
                  sourceUrl: 'https://github.com/trpc/trpc/blob/v12/next',
                },
                undefined,
              ),
              (output) => output.rendered.html,
            ),
          );
        const pages = yield* Effect.all([renderParts('a'), renderParts('b')], {
          concurrency: 'unbounded',
        });
        expect(pages).toEqual([
          ['<p>a one</p>', '<p>a two</p>', '<p>a three</p>'],
          ['<p>b one</p>', '<p>b two</p>', '<p>b three</p>'],
        ]);
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("fails with the page's error", () =>
    Effect.gen(function* () {
      const made = yield* dirs;
      const renderers = yield* pool;
      const error = yield* Effect.flip(
        renderers.render(
          '```ts twoslash\nconst a: number = "a";\n```',
          {
            basePath: '/docs',
            samplesDir: made.samplesDir,
            slug: 'broken',
            sourceUrl: 'https://github.com/trpc/trpc/blob/v12/next',
          },
          undefined,
        ),
      );
      expect(error._tag).toBe('ContentError');
      expect(error.message).toContain("Type 'string' is not assignable");
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});
