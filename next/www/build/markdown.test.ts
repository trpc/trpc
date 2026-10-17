import { NodeServices } from '@effect/platform-node';
import { describe, expect, it } from '@effect/vitest';
import { Effect, FileSystem, Path } from 'effect';

import { brokenLinks } from './content.ts';
import { renderMarkdown, resolveLink } from './markdown.ts';

/** A samples dir whose `docs` app compiles inline blocks, removed when the test ends. */
const samples = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = yield* fs.makeTempDirectoryScoped({ prefix: 'markdown-' });
  const app = path.join(root, 'docs');
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
  return root;
});

const render = (markdown: string, slug = 'client/links') =>
  Effect.flatMap(samples, (samplesDir) =>
    renderMarkdown(markdown, {
      samplesDir,
      slug,
      sourceUrl: 'https://github.com/trpc/trpc/blob/v12/next',
    }),
  );

describe('renderMarkdown', () => {
  it.effect("lists each block's type queries in page order", () =>
    Effect.gen(function* () {
      // As in a build, an earlier page has made Shiki load `ts` already.
      yield* render('```ts\nconst a = 1;\n```');
      const markdown = [
        '```tsx twoslash',
        'const first = 1;',
        '//    ^?',
        '```',
        '',
        '```json',
        '{ "a": 1 }',
        '```',
        '',
        '```ts twoslash',
        'const second = "b";',
        '//    ^?',
        '```',
      ].join('\n');
      const rendered = yield* render(markdown);
      expect(rendered.typeQueries).toEqual([
        ['const first: 1'],
        ['const second: "b"'],
      ]);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("compiles an inline block next to the docs app's files", () =>
    Effect.gen(function* () {
      const rendered = yield* render(
        [
          '```ts twoslash',
          "import { greeting } from './server.ts';",
          '// ---cut---',
          'const shown = greeting;',
          '//    ^?',
          '```',
        ].join('\n'),
      );
      expect(rendered.typeQueries).toEqual([['const shown: "hello"']]);
      expect(rendered.html).not.toContain('./server.ts');
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect('fails on a compile error the block does not expect', () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        render('```ts twoslash\nconst a: number = "a";\n```'),
      );
      expect(error.message).toContain('2322');
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect('rewrites links to pages and to files outside the docs', () =>
    Effect.gen(function* () {
      const rendered = yield* render(
        [
          '[Batching](./batching.md#options), [server](../server/procedures.md),',
          '[example](../../examples/chat/server.ts) and [site](https://trpc.io).',
        ].join(' '),
      );
      expect(rendered.links).toEqual([
        { hash: 'options', slug: 'client/batching' },
        { hash: undefined, slug: 'server/procedures' },
      ]);
      expect(rendered.html).toContain('href="/docs/client/batching#options"');
      expect(rendered.html).toContain('href="/docs/server/procedures"');
      expect(rendered.html).toContain(
        'href="https://github.com/trpc/trpc/blob/v12/next/examples/chat/server.ts"',
      );
      expect(rendered.html).toContain('href="https://trpc.io"');
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect('shows a package-install fence as a tab per package manager', () =>
    Effect.gen(function* () {
      const rendered = yield* render(
        '```package-install\n-D @trpc12/trpc zod\n```',
      );
      expect(rendered.html).toContain('data-tabs="package-manager"');
      for (const command of [
        'pnpm add -D @trpc12/trpc zod',
        'npm install -D @trpc12/trpc zod',
        'yarn add -D @trpc12/trpc zod',
        'bun add -d @trpc12/trpc zod',
      ]) {
        const [manager = '', ...rest] = command.split(' ');
        expect(rendered.html).toContain(`data-tab-select="${manager}"`);
        expect(rendered.html.replaceAll(/<[^>]+>/g, '')).toContain(
          [manager, ...rest].join(' '),
        );
      }
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect('collects h2 and h3 headings with ids', () =>
    Effect.gen(function* () {
      const rendered = yield* render(
        '## Call options\n\n### `signal`\n\n#### Deep',
      );
      expect(rendered.headings).toEqual([
        { depth: 2, id: 'call-options', text: 'Call options' },
        { depth: 3, id: 'signal', text: 'signal' },
      ]);
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});

describe('resolveLink', () => {
  it('resolves relative page links from nested pages', () => {
    expect(resolveLink('client/links', '../server/router.md#lazy')).toEqual({
      kind: 'doc',
      link: { hash: 'lazy', slug: 'server/router' },
    });
    expect(resolveLink('getting-started', 'client/links.md')).toEqual({
      kind: 'doc',
      link: { hash: undefined, slug: 'client/links' },
    });
  });

  it('points links out of the docs folder at the source', () => {
    expect(resolveLink('adapters/node', '../../README.md')).toEqual({
      kind: 'source',
      path: 'README.md',
    });
  });

  it('leaves external links and anchors alone', () => {
    expect(resolveLink('a', 'https://example.com')).toEqual({ kind: 'other' });
    expect(resolveLink('a', 'mailto:a@b.c')).toEqual({ kind: 'other' });
    expect(resolveLink('a', '#heading')).toEqual({ kind: 'other' });
  });
});

describe('brokenLinks', () => {
  it('reports missing pages and headings', () => {
    const page = (slug: string, ids: ReadonlyArray<string>) => ({
      description: '',
      headings: ids.map((id) => ({ depth: 2 as const, id, text: id })),
      lastModified: undefined,
      section: 'Core',
      slug,
      title: slug,
    });
    expect(
      brokenLinks([
        {
          doc: page('a', ['intro']),
          links: [
            { hash: 'intro', slug: 'a' },
            { hash: undefined, slug: 'b' },
            { hash: 'missing', slug: 'a' },
          ],
        },
      ]),
    ).toEqual([
      "a: links to b.md, which isn't a page",
      'a: links to a.md#missing, which has no such heading',
    ]);
  });
});
