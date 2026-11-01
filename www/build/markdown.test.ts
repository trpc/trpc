import { NodeServices } from '@effect/platform-node';
import { describe, expect, it } from '@effect/vitest';
import { Effect, FileSystem, Path } from 'effect';

import { brokenLinks } from './content.ts';
import {
  anchorsOf,
  releaseTwoslashers,
  renderMarkdown,
  resolveLink,
} from './markdown.ts';
import { removeAll } from './old-docs-convert.ts';

/**
 * A samples dir whose `docs` and `v11` apps compile inline blocks, each with
 * its own `greeting`, removed when the test ends.
 */
/** The HTML's text, without its tags. */
const textOf = (html: string) =>
  removeAll(html, /<[^>]*>/g).replaceAll('<', '');

const samples = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = yield* fs.makeTempDirectoryScoped({ prefix: 'markdown-' });
  for (const name of ['docs', 'v11']) {
    const app = path.join(root, name);
    yield* fs.makeDirectory(path.join(app, 'src'), { recursive: true });
    yield* fs.writeFileString(
      path.join(app, 'src/server.ts'),
      `export const greeting = "hello from ${name}" as const;\n`,
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
  }
  return root;
});

const render = (markdown: string, slug = 'client/links', inlineApp?: string) =>
  Effect.flatMap(samples, (samplesDir) =>
    renderMarkdown(markdown, {
      basePath: '/docs',
      inlineApp,
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
      expect(rendered.typeQueries).toEqual([
        ['const shown: "hello from docs"'],
      ]);
      expect(rendered.html).not.toContain('./server.ts');
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect('compiles inline blocks in the app `inlineApp` names', () =>
    Effect.gen(function* () {
      const rendered = yield* render(
        [
          '```ts twoslash',
          "import { greeting } from './server.ts';",
          'const shown = greeting;',
          '//    ^?',
          '```',
        ].join('\n'),
        'server/procedures',
        'v11',
      );
      expect(rendered.typeQueries).toEqual([['const shown: "hello from v11"']]);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect(
    "resolves a block's `.tsx` file where an earlier block had a `.ts` of that name",
    () =>
      Effect.gen(function* () {
        const rendered = yield* render(
          [
            '```ts twoslash',
            '// @filename: utils/trpc.ts',
            'export const trpc = 1;',
            '// @filename: index.ts',
            "import { trpc } from './utils/trpc';",
            'trpc;',
            '```',
            '',
            '```tsx twoslash',
            '// @filename: utils/trpc.tsx',
            'export const trpc = "react" as const;',
            '// @filename: index.ts',
            "import { trpc } from './utils/trpc';",
            'const shown = trpc;',
            '//    ^?',
            '```',
          ].join('\n'),
        );
        expect(rendered.typeQueries).toEqual([[], ['const shown: "react"']]);
      }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect(
    'shows a property of a hidden call without an empty line after it',
    () =>
      Effect.gen(function* () {
        const rendered = yield* render(
          [
            '```ts twoslash',
            '// ---cut-start---',
            'const wrap = (opts: { layer: number }) => opts;',
            'wrap({',
            '  // ---cut-end---',
            '  layer: 1,',
            '  // ---cut-after---',
            '});',
            '```',
          ].join('\n'),
        );
        expect(rendered.html).toContain('layer');
        expect(rendered.html).not.toContain('wrap');
        expect(rendered.html).not.toMatch(
          /<span class="line"><\/span><\/code>/,
        );
      }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect(
    'compiles with the right flags after their environment was dropped, and after a release',
    () =>
      Effect.gen(function* () {
        const block = (flags: string) =>
          [
            '```ts twoslash',
            flags,
            'const m = [null];',
            '//    ^?',
            '```',
          ].join('\n');
        // More sets of flags than environments stay alive: the first set's
        // is dropped by the time it's back.
        const rendered = yield* render(
          [
            block(''),
            block('// @target: es2017'),
            block('// @target: es2019'),
            block('// @target: es2020'),
            block('// @strict: false'),
            block(''),
          ].join('\n\n'),
        );
        expect(rendered.typeQueries).toEqual([
          ['const m: null[]'],
          ['const m: null[]'],
          ['const m: null[]'],
          ['const m: null[]'],
          ['const m: any[]'],
          ['const m: null[]'],
        ]);
        releaseTwoslashers();
        const again = yield* render(block('// @strict: false'));
        expect(again.typeQueries).toEqual([['const m: any[]']]);
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
        expect(textOf(rendered.html)).toContain([manager, ...rest].join(' '));
      }
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect('badges an install of @trpc12 packages, which are not on npm', () =>
    Effect.gen(function* () {
      const unpublished = yield* render(
        '```package-install\n@trpc12/trpc zod\n```',
      );
      expect(unpublished.html).toContain('data-unpublished');
      expect(unpublished.html).toContain(
        '<span class="code-unpublished" title="The @trpc12 packages aren’t published until tRPC v12 is released">Not on npm yet</span>',
      );
      const published = yield* render(
        '```package-install\n@tanstack/db @trpc/server\n```',
      );
      expect(published.html).not.toContain('data-unpublished');
      expect(published.html).not.toContain('code-unpublished');
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect('collects h2 and h3 headings, and every heading as an anchor', () =>
    Effect.gen(function* () {
      const markdown = '## Call options\n\n### `signal`\n\n#### Deep';
      const rendered = yield* render(markdown);
      expect(rendered.headings).toEqual([
        { depth: 2, id: 'call-options', text: 'Call options' },
        { depth: 3, id: 'signal', text: 'signal' },
      ]);
      expect(rendered.anchors).toEqual(['call-options', 'signal', 'deep']);
      expect(yield* anchorsOf(markdown)).toEqual(rendered.anchors);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect('keeps a heading id written as `{#id}`', () =>
    Effect.gen(function* () {
      const markdown = '## Connection params {#params}\n\n## Other';
      const rendered = yield* render(markdown);
      expect(rendered.headings).toEqual([
        { depth: 2, id: 'params', text: 'Connection params' },
        { depth: 2, id: 'other', text: 'Other' },
      ]);
      expect(rendered.html).toContain('id="params"');
      expect(rendered.html).not.toContain('{#params}');
      expect(yield* anchorsOf(markdown)).toEqual(['params', 'other']);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("titles an alert with its marker line's text", () =>
    Effect.gen(function* () {
      const rendered = yield* render(
        '> [!TIP] AI **agents**\n> Install the skills.\n\n> [!NOTE]\n> Plain.',
      );
      const text = textOf(rendered.html);
      expect(text).toContain('AI agents');
      expect(rendered.html).toContain('<strong>agents</strong>');
      expect(text).toContain('Install the skills.');
      expect(text).toContain('Note');
      expect(text).not.toContain('[!');
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect('shows the tab marked `data-active` in a group of prose tabs', () =>
    Effect.gen(function* () {
      const rendered = yield* render(
        [
          '<div class="code-tabs" data-tabs="validator">',
          '<div data-tab="Vanilla">',
          '',
          'A **function**.',
          '',
          '</div>',
          '<div data-tab="Zod" data-active>',
          '',
          'A schema.',
          '',
          '</div>',
          '</div>',
        ].join('\n'),
      );
      expect(rendered.html).toContain('<strong>function</strong>');
      expect(rendered.html).toMatch(
        /aria-selected="false"[^>]*>Vanilla<\/button>/,
      );
      expect(rendered.html).toMatch(/aria-selected="true"[^>]*>Zod<\/button>/);
      expect(rendered.html).toMatch(/<div data-tab="Vanilla">/);
      expect(rendered.html).toMatch(/<div data-tab="Zod" data-active="">/);
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

  it('resolves from where contentPath puts the docs folder', () => {
    expect(
      resolveLink('server/files', '../../../examples/a/README.md', 'www/docs'),
    ).toEqual({ kind: 'source', path: 'examples/a/README.md' });
    expect(
      resolveLink('client/links', '../server/router.md#lazy', 'www/docs'),
    ).toEqual({ kind: 'doc', link: { hash: 'lazy', slug: 'server/router' } });
    expect(resolveLink('a', '../README.md', 'www/docs')).toEqual({
      kind: 'source',
      path: 'www/README.md',
    });
  });

  it('leaves external links and anchors alone', () => {
    expect(resolveLink('a', 'https://example.com')).toEqual({ kind: 'other' });
    expect(resolveLink('a', 'mailto:a@b.c')).toEqual({ kind: 'other' });
    expect(resolveLink('a', '#heading')).toEqual({ kind: 'other' });
    expect(resolveLink('a', '/v9/docs/nextjs#hooks')).toEqual({
      kind: 'other',
    });
  });
});

describe('brokenLinks', () => {
  it('reports missing pages and headings', () => {
    expect(
      brokenLinks([
        {
          anchors: ['intro'],
          doc: { slug: 'a' },
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
