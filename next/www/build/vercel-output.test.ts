import { NodeServices } from '@effect/platform-node';
import { describe, expect, it } from '@effect/vitest';
import { Effect, FileSystem, Path } from 'effect';

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
const setup = Effect.fn('setup')(function* (llms: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = yield* fs.makeTempDirectoryScoped({ prefix: 'vercel-output-' });
  const files = {
    '404.html': '',
    'assets/app.js': '',
    'docs/client/links.md': '',
    'docs/client/links/index.html': '',
    'index.html': '',
    'index.md': '',
    'llms.txt': llms,
  };
  for (const [file, contents] of Object.entries(files)) {
    const target = path.join(root, 'dist/client', file);
    yield* fs.makeDirectory(path.dirname(target), { recursive: true });
    yield* fs.writeFileString(target, contents);
  }
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
        'docs/client/links.md': {
          contentType: 'text/markdown; charset=utf-8',
        },
        'docs/client/links/index.html': {
          contentType: 'text/html; charset=utf-8',
          path: 'docs/client/links',
        },
        'index.md': { contentType: 'text/markdown; charset=utf-8' },
        'llms.txt': { contentType: 'text/plain; charset=utf-8' },
      });
      expect(config.routes).toContainEqual({
        headers: { Location: '/docs/getting-started' },
        src: '^/docs$',
        status: 307,
      });

      const markdownRewrite = config.routes.find(
        (route: { dest?: string }) => route.dest === '/docs/$1.md',
      );
      const match = new RegExp(markdownRewrite.src).exec('/docs/client/links');
      expect(match?.[1]).toBe('client/links');
      expect(new RegExp(markdownRewrite.src).test('/docs/a.md')).toBe(false);
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
