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
  '- [Getting started](https://v12.trpc.io/v12/docs/getting-started.md): A router.',
  '- [Links](https://v12.trpc.io/v12/docs/client/links.md): Links.',
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
    'favicon.ico': '',
    'v12/docs/client/links.md': '',
    'v12/docs/client/links/index.html': '',
    'index.html': '',
    'index.md': '',
    'llms.txt': llms,
    'logo.svg': '',
    'docs/server/routers/index.html': '<h2 id="nesting">Nesting</h2>',
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
        yield* fs.exists(path.join(output, 'static/v12/docs/client/links.md')),
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
        'v12/docs/client/links.md': {
          contentType: 'text/markdown; charset=utf-8',
        },
        'v12/docs/client/links/index.html': {
          contentType: 'text/html; charset=utf-8',
          path: 'v12/docs/client/links',
        },
        'index.md': { contentType: 'text/markdown; charset=utf-8' },
        'llms.txt': { contentType: 'text/plain; charset=utf-8' },
        'docs/server/routers/index.html': {
          contentType: 'text/html; charset=utf-8',
          path: 'docs/server/routers',
        },
      });
      expect(config.routes).toContainEqual({
        headers: { Location: '/v12/docs/getting-started' },
        src: '^/v12/docs$',
        status: 307,
      });
      // v11, the stable release, has `/docs`.
      for (const [basePath, src] of [
        ['/docs', '^/docs$'],
        ['/v10/docs', '^/v10/docs$'],
        ['/v9/docs', '^/v9/docs$'],
      ]) {
        expect(config.routes).toContainEqual({
          headers: { Location: `${basePath}/introduction` },
          src,
          status: 307,
        });
      }
      const moved = config.routes.find(
        (route: { src: string; status?: number }) =>
          route.status === 308 && route.src.includes('v11'),
      );
      expect(moved.headers.Location).toBe('/docs$1');
      expect(
        '/v11/docs/client/links'.replace(new RegExp(moved.src), '/docs$1'),
      ).toBe('/docs/client/links');
      expect('/v11/docs'.replace(new RegExp(moved.src), '/docs$1')).toBe(
        '/docs',
      );

      const markdownRewrite = config.routes.find(
        (route: { dest?: string }) => route.dest === '/v12/docs/$1.md',
      );
      const match = new RegExp(markdownRewrite.src).exec(
        '/v12/docs/client/links',
      );
      expect(match?.[1]).toBe('client/links');
      expect(new RegExp(markdownRewrite.src).test('/v12/docs/a.md')).toBe(
        false,
      );
      // The copies have no markdown.
      expect(new RegExp(markdownRewrite.src).test('/docs/a')).toBe(false);
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
          '/docs/server/routers#nesting',
        ]);
        expect(land(config.routes, served, '/docs/server/routers')).toEqual({
          hash: '',
          hops: [],
          landed: { kind: 'file', path: '/docs/server/routers' },
        });

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
          "/docs/router: redirects to /docs/server/routers#gone, a heading the page doesn't have",
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
