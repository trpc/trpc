import { describe, expect, it } from '@effect/vitest';

import { fromDocusaurus } from './docusaurus-syntax.ts';

const read = (lines: ReadonlyArray<string>, twoslash = true) =>
  fromDocusaurus(lines.join('\n'), twoslash);

describe('fromDocusaurus', () => {
  it('turns admonitions into alerts, apart from the HTML around them', () => {
    expect(
      read([
        '<br />',
        ':::info',
        'We use `zod`.',
        '',
        '```ts',
        'z.string();',
        '```',
        ':::',
        '',
        ':::tip AI Agents',
        'Install the skills.',
        ':::',
      ]),
    ).toEqual({
      markdown: [
        '<br />',
        '',
        '> [!NOTE] Info',
        '> We use `zod`.',
        '>',
        '> ```ts',
        '> z.string();',
        '> ```',
        '',
        '',
        '> [!TIP] AI Agents',
        '> Install the skills.',
        '',
      ].join('\n'),
      problems: [],
    });
  });

  it('closes an admonition reopened by mistake, which Docusaurus nests the page in', () => {
    expect(read([':::tip', 'Careful!', ':::tip', '', '## Next']).markdown).toBe(
      ['> [!TIP]', '> Careful!', '', '', '## Next'].join('\n'),
    );
  });

  it('reports an admonition it has no alert for, or one left open', () => {
    expect(read([':::danger', 'a', ':::', ':::fun', 'b']).problems).toEqual([
      '`:::fun`',
    ]);
    expect(read([':::tip', 'a']).problems).toEqual([
      "an admonition isn't closed",
    ]);
  });

  const twoslashPage = [
    '```twoslash include trpc',
    "import { initTRPC } from '@trpc/server';",
    'export const t = initTRPC.create();',
    '```',
    '',
    "```TS twoslash title='server.ts'",
    '// @filename: trpc.ts',
    '// @include: trpc',
    '//    ^?',
    '// @filename: server.ts',
    '// ---cut---',
    "import { t } from './trpc';",
    'const router = t.router({});',
    '//    ^?',
    '// @errors: 2322',
    '```',
  ];

  it('expands the includes of Twoslash blocks that compile, and drops the queries of hidden code', () => {
    expect(read(twoslashPage)).toEqual({
      markdown: [
        '```ts twoslash title="server.ts"',
        '// @filename: trpc.ts',
        "import { initTRPC } from '@trpc/server';",
        'export const t = initTRPC.create();',
        '// @filename: server.ts',
        '// ---cut---',
        "import { t } from './trpc';",
        'const router = t.router({});',
        '//    ^?',
        '// @errors: 2322',
        '```',
      ].join('\n'),
      problems: [],
    });
  });

  it("shows the Twoslash blocks of code that doesn't compile as trpc.io did, as plain code", () => {
    expect(read(twoslashPage, false)).toEqual({
      markdown: [
        '```ts title="server.ts"',
        "import { t } from './trpc';",
        'const router = t.router({});',
        '```',
      ].join('\n'),
      problems: [],
    });
  });

  it('reports an include that no block defines', () => {
    expect(
      read(['```ts twoslash', '// @include: missing', '```']).problems,
    ).toEqual(['`// @include: missing`: no `twoslash include missing`']);
  });

  it('drops HTML comments, with the fences they comment out', () => {
    expect(
      read([
        '<!-- runtypes example is broken -->',
        '<!--',
        '```ts twoslash',
        'broken();',
        '``` -->',
        '',
        '```ts twoslash',
        'works();',
        '```',
        '`<!-- code -->`',
      ]).markdown,
    ).toBe(
      ['', '```ts twoslash', 'works();', '```', '`<!-- code -->`'].join('\n'),
    );
  });

  it('leaves Markdown without Docusaurus syntax as it is', () => {
    const markdown = [
      '> [!TIP]',
      '> Tip.',
      '',
      '```ts title="a.ts" {1}',
      'a();',
      '```',
    ];
    expect(read(markdown).markdown).toBe(markdown.join('\n'));
  });
});
