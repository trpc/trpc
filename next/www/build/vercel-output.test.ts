import { NodeServices } from '@effect/platform-node';
import { describe, expect, it } from '@effect/vitest';
import { Effect, FileSystem, Path } from 'effect';

import {
  land,
  redirectsFile,
  servedPaths,
  type TrpcRedirect,
} from './old-routes.ts';
import { firstDoc, writeVercelOutput } from './vercel-output.ts';

const llmsTxt = [
  '# tRPC',
  '',
  '## Getting started',
  '',
  '- [Getting started](https://v12.trpc.io/docs/getting-started.md): A router.',
  '- [Links](https://v12.trpc.io/docs/client/links.md): Links.',
  '',
].join('\n');

/** A prerendered site in a temp dir, removed when the test ends. */
const setup = Effect.fn('setup')(function* (
  llms: string,
  redirects: ReadonlyArray<TrpcRedirect> = [
    {
      destination: '/docs/server/routers#nesting',
      permanent: true,
      source: '/docs/router',
    },
  ],
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = yield* fs.makeTempDirectoryScoped({ prefix: 'vercel-output-' });
  const files = {
    '404.html': '',
    'apple-touch-icon.png': '',
    'assets/app.js': '',
    'blog/index.html': '',
    'docs/client/links.md': '',
    'docs/client/links/index.html': '',
    'favicon.ico': '',
    'index.html': '',
    'index.md': '',
    'llms.txt': llms,
    'logo.svg': '',
    'v11/docs/server/routers/index.html': '<h2 id="nesting">Nesting</h2>',
  };
  for (const [file, contents] of Object.entries(files)) {
    const target = path.join(root, 'dist/client', file);
    yield* fs.makeDirectory(path.dirname(target), { recursive: true });
    yield* fs.writeFileString(target, contents);
  }
  yield* fs.writeFileString(
    path.join(root, redirectsFile),
    JSON.stringify(redirects),
  );
  return root;
});

describe('firstDoc', () => {
  it('reads the first page llms.txt links to', () => {
    expect(firstDoc(llmsTxt)).toBe('getting-started');
    expect(firstDoc('# tRPC\n')).toBeUndefined();
  });
});

describe('writeVercelOutput', () => {
  it.effect('copies the site and writes its routes', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* setup(llmsTxt);
      yield* writeVercelOutput(root);
      yield* writeVercelOutput(root);

      const output = path.join(root, '.vercel/output');
      expect(
        yield* fs.exists(path.join(output, 'static/docs/client/links.md')),
      ).toBe(true);
      const config = JSON.parse(
        yield* fs.readFileString(path.join(output, 'config.json')),
      );
      expect(config.version).toBe(3);
      expect(config.overrides).toEqual({
        'blog/index.html': {
          contentType: 'text/html; charset=utf-8',
          path: 'blog',
        },
        'docs/client/links.md': {
          contentType: 'text/markdown; charset=utf-8',
        },
        'docs/client/links/index.html': {
          contentType: 'text/html; charset=utf-8',
          path: 'docs/client/links',
        },
        'index.md': { contentType: 'text/markdown; charset=utf-8' },
        'llms.txt': { contentType: 'text/plain; charset=utf-8' },
        'v11/docs/server/routers/index.html': {
          contentType: 'text/html; charset=utf-8',
          path: 'v11/docs/server/routers',
        },
      });
      expect(config.routes).toContainEqual({
        headers: { Location: '/docs/getting-started' },
        src: '^/docs$',
        status: 307,
      });
      for (const version of ['v11', 'v10', 'v9']) {
        expect(config.routes).toContainEqual({
          headers: { Location: `/${version}/docs/introduction` },
          src: `^/${version}/docs$`,
          status: 307,
        });
      }

      const markdownRewrite = config.routes.find(
        (route: { dest?: string }) => route.dest === '/docs/$1.md',
      );
      const match = new RegExp(markdownRewrite.src).exec('/docs/client/links');
      expect(match?.[1]).toBe('client/links');
      expect(new RegExp(markdownRewrite.src).test('/docs/a.md')).toBe(false);
      // The copies have no markdown.
      expect(new RegExp(markdownRewrite.src).test('/v11/docs/a')).toBe(false);
      expect(new RegExp(markdownRewrite.src).test('/v9/docs/a')).toBe(false);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect(
    "redirects trpc.io's URLs, and fails on one that lands nowhere",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* setup(llmsTxt);
        yield* writeVercelOutput(root);
        const output = path.join(root, '.vercel/output');
        const config = JSON.parse(
          yield* fs.readFileString(path.join(output, 'config.json')),
        );
        const served = servedPaths(
          (yield* fs.readDirectory(path.join(output, 'static'), {
            recursive: true,
          })).map((file) => file.split(path.sep).join('/')),
        );
        expect(land(config.routes, served, '/docs/router').hops).toEqual([
          '/v11/docs/server/routers#nesting',
        ]);
        expect(
          land(config.routes, served, '/docs/server/routers').hops,
        ).toEqual(['/v11/docs/server/routers']);

        const broken = yield* setup(llmsTxt, [
          { destination: '/docs/gone', permanent: true, source: '/docs/old' },
        ]);
        const error = yield* Effect.flip(writeVercelOutput(broken));
        expect(error.message).toContain(
          "/docs/old: trpc.io sends it to /docs/gone, which this site doesn't serve",
        );

        const noHeading = yield* setup(llmsTxt, [
          {
            destination: '/docs/server/routers#gone',
            permanent: true,
            source: '/docs/router',
          },
        ]);
        const headingError = yield* Effect.flip(writeVercelOutput(noHeading));
        expect(headingError.message).toContain(
          "/docs/router: redirects to /v11/docs/server/routers#gone, a heading the page doesn't have",
        );
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect('fails when llms.txt links to no page', () =>
    Effect.gen(function* () {
      const root = yield* setup('# tRPC\n');
      const error = yield* Effect.flip(writeVercelOutput(root));
      expect(error._tag).toBe('VercelOutputError');
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});
