import { describe, expect, it } from '@effect/vitest';

import {
  convertPage,
  dropMissingAnchors,
  jsxToHtml,
  relativeLink,
  resolveV11Link,
  sidebarSections,
  styleOf,
  type V11Docs,
  type V11Page,
} from './v11-convert.ts';

const page = (
  slug: string,
  file: string,
  fields: Partial<V11Page> = {},
): V11Page => ({
  description: `About ${slug}`,
  file,
  label: undefined,
  order: 0,
  parent: undefined,
  section: 'Backend Usage',
  slug,
  title: slug,
  ...fields,
});

const pages = [
  page('introduction', 'docs/main/introduction.mdx'),
  page('server/procedures', 'docs/server/procedures.md'),
  page('server/routers', 'docs/server/routers.md'),
  page('client/links', 'docs/client/links/overview.md'),
];

/** Converts `body` as the page `server/procedures`, among `files`. */
function convert(body: string, files: Record<string, string> = {}) {
  const docs: V11Docs = {
    archived: new Map([
      ['versioned_docs/version-9.x/nextjs/introduction.md', '/docs/v9/nextjs'],
    ]),
    files: new Map(
      Object.entries({ ...files, 'docs/server/procedures.md': body }),
    ),
    pages,
  };
  const converted = convertPage(pages[1] ?? page('', ''), docs);
  return {
    ...converted,
    body: converted.markdown.replace(/^---\n[\s\S]*?\n---\n\n/, ''),
  };
}

describe('convertPage', () => {
  it('writes the frontmatter, with the label only where it differs', () => {
    const docs: V11Docs = {
      archived: new Map(),
      files: new Map([['docs/a.md', '---\nid: a\n---\n\nHello.\n']]),
      pages: [],
    };
    expect(
      convertPage(
        page('a', 'docs/a.md', {
          label: 'Short',
          order: 3,
          section: 'tRPC',
          title: 'A "quoted" title',
        }),
        docs,
      ).markdown,
    ).toBe(
      [
        '---',
        'title: "A \\"quoted\\" title"',
        'label: "Short"',
        'description: "About a"',
        'section: "tRPC"',
        'order: 3',
        '---',
        '',
        'Hello.',
        '',
      ].join('\n'),
    );
  });

  it('turns admonitions into alerts, apart from the HTML around them', () => {
    const converted = convert(
      [
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
      ].join('\n'),
    );
    expect(converted.problems).toEqual([]);
    expect(converted.body).toBe(
      [
        '<br />',
        '',
        '> [!NOTE] Info',
        '> We use `zod`.',
        '>',
        '> ```ts',
        '> z.string();',
        '> ```',
        '',
        '> [!TIP] AI Agents',
        '> Install the skills.',
        '',
      ].join('\n'),
    );
  });

  it('turns tabs into a tab group, with its default tab', () => {
    const converted = convert(
      [
        "import Tabs from '@theme/Tabs';",
        "import TabItem from '@theme/TabItem';",
        '',
        '<Tabs>',
        '  <TabItem value="vanilla" label="Vanilla">',
        '    A **function**.',
        '  </TabItem>',
        '  <TabItem value="zod" label="Zod" default>',
        '',
        '```ts',
        '  z.string();',
        '```',
        '',
        '  </TabItem>',
        '</Tabs>',
      ].join('\n'),
    );
    expect(converted.problems).toEqual([]);
    expect(converted.body).toBe(
      [
        '<div class="code-tabs" data-tabs="tabs-vanilla-zod">',
        '<div data-tab="Vanilla">',
        '',
        'A **function**.',
        '',
        '</div>',
        '<div data-tab="Zod" data-active>',
        '',
        '```ts',
        '  z.string();',
        '```',
        '',
        '</div>',
        '</div>',
        '',
      ].join('\n'),
    );
  });

  it('groups tabs of package managers with the install commands', () => {
    const converted = convert(
      [
        "import Tabs from '@theme/Tabs';",
        "import TabItem from '@theme/TabItem';",
        '',
        '<Tabs>',
        '<TabItem value="npm">',
        '',
        'npm',
        '',
        '</TabItem>',
        '<TabItem value="pnpm">',
        '',
        'pnpm',
        '',
        '</TabItem>',
        '</Tabs>',
      ].join('\n'),
    );
    expect(converted.body).toContain('data-tabs="package-manager"');
    expect(converted.body).toContain('<div data-tab="pnpm">');
  });

  it("shows a Twoslash block's code as trpc.io does, with its includes", () => {
    const converted = convert(
      [
        '```twoslash include trpc',
        "import { initTRPC } from '@trpc/server';",
        'export const t = initTRPC.create();',
        '```',
        '',
        "```ts twoslash title='server.ts'",
        '// @filename: trpc.ts',
        '// @include: trpc',
        '// @filename: server.ts',
        '// ---cut---',
        "import { t } from './trpc';",
        'const router = t.router({});',
        '//    ^?',
        '// @errors: 2322',
        '```',
      ].join('\n'),
    );
    expect(converted.problems).toEqual([]);
    expect(converted.body).toBe(
      [
        '```ts title="server.ts"',
        "import { t } from './trpc';",
        'const router = t.router({});',
        '```',
        '',
      ].join('\n'),
    );
  });

  it('drops HTML comments, with the fences they comment out', () => {
    const converted = convert(
      [
        '<!-- runtypes example is broken -->',
        '<!--',
        '```ts twoslash',
        'broken();',
        '``` -->',
        '',
        '```ts twoslash',
        'works();',
        '```',
      ].join('\n'),
    );
    expect(converted.problems).toEqual([]);
    expect(converted.body).toBe('```ts\nworks();\n```\n');
  });

  it('reports an include that no block defines', () => {
    const converted = convert('```ts twoslash\n// @include: missing\n```');
    expect(converted.problems).toEqual([
      'docs/server/procedures.md: `// @include: missing`: no `twoslash include missing`',
    ]);
  });

  it('points links at the copied pages, or else at trpc.io', () => {
    const converted = convert(
      [
        '[Routers](./routers.md#merging), [links](/docs/client/links),',
        '[intro](/docs), [v9](../../versioned_docs/version-9.x/nextjs/introduction.md#hooks),',
        '[blog](/blog/announcing-trpc-v11) and [npm](https://npmjs.com).',
        '<a href="../client/links">Links</a>',
        '![Diagram](/img/links-diagram.svg)',
      ].join('\n'),
    );
    expect(converted.problems).toEqual([]);
    expect(converted.body).toBe(
      [
        '[Routers](./routers.md#merging), [links](../client/links.md),',
        '[intro](../introduction.md), [v9](https://trpc.io/docs/v9/nextjs#hooks),',
        '[blog](https://trpc.io/blog/announcing-trpc-v11) and [npm](https://npmjs.com).',
        '<a href="/v11/docs/client/links">Links</a>',
        '![Diagram](/v11/img/links-diagram.svg)',
        '',
      ].join('\n'),
    );
    expect(converted.images).toEqual(['static/img/links-diagram.svg']);
  });

  it('reports a link to a file that is not a page', () => {
    expect(convert('[Old](./gone.md)').problems).toEqual([
      "docs/server/procedures.md: ./gone.md isn't a page of the sidebar",
    ]);
  });

  it('expands partials, install snippets and static components', () => {
    const converted = convert(
      [
        "import Intro from '../partials/_intro.mdx';",
        "import { InstallSnippet } from '@site/src/components/InstallSnippet';",
        "import Logo from '@site/src/components/Logo';",
        '',
        '<Intro />',
        '',
        '<InstallSnippet pkgs="@trpc/server zod" />',
        '',
        '<Logo />',
        '',
        '`<NotAComponent />` stays as written.',
      ].join('\n'),
      {
        'docs/partials/_intro.mdx': 'See [routers](../server/routers.md).\n',
        'src/components/Logo.tsx': [
          'export default function Logo() {',
          '  return (',
          '    <div className="logo" style={{ marginTop: 12 }}>',
          "      tRPC{' '}",
          '    </div>',
          '  );',
          '}',
        ].join('\n'),
      },
    );
    expect(converted.problems).toEqual([]);
    expect(converted.body).toBe(
      [
        'See [routers](./routers.md).',
        '',
        '```package-install',
        '@trpc/server zod',
        '```',
        '',
        '<div class="logo" style="margin-top: 12px">',
        '      tRPC ',
        '    </div>',
        '',
        '`<NotAComponent />` stays as written.',
        '',
      ].join('\n'),
    );
  });

  it('reports what it has no conversion for', () => {
    const converted = convert(
      [
        "import Fancy from '@site/src/components/Fancy';",
        'export const meta = {};',
        '',
        '<Fancy size={2} />',
        '<Unknown />',
        ':::danger',
        'Never closed.',
      ].join('\n'),
      { 'src/components/Fancy.tsx': '' },
    );
    expect(converted.problems).toEqual([
      'docs/server/procedures.md: `export const meta = {};`',
      'docs/server/procedures.md: `<Fancy size={2} />`: only components without props that return static JSX inline',
      'docs/server/procedures.md: `<Unknown />`: not imported',
      'docs/server/procedures.md: no conversion for <Fancy>',
      'docs/server/procedures.md: no conversion for <Unknown>',
      "docs/server/procedures.md: an admonition isn't closed",
    ]);
  });
});

describe('resolveV11Link', () => {
  const context: Parameters<typeof resolveV11Link>[1] = {
    file: 'docs/server/procedures.md',
    pages,
    slug: 'server/procedures',
  };

  it('resolves file paths from the file, and URLs from the page', () => {
    expect(resolveV11Link('../client/links/overview.md', context)).toEqual({
      hash: '',
      kind: 'page',
      slug: 'client/links',
    });
    expect(resolveV11Link('routers#lazy', context)).toEqual({
      hash: 'lazy',
      kind: 'page',
      slug: 'server/routers',
    });
    expect(resolveV11Link('https://trpc.io/docs', context)).toEqual({
      hash: '',
      kind: 'page',
      slug: 'introduction',
    });
  });

  it('leaves anchors and other sites alone', () => {
    expect(resolveV11Link('#options', context)).toBeUndefined();
    expect(resolveV11Link('https://github.com/trpc', context)).toBeUndefined();
  });
});

describe('relativeLink', () => {
  it('links between pages as relative files', () => {
    expect(relativeLink('server/procedures', 'server/routers')).toBe(
      './routers.md',
    );
    expect(relativeLink('server/procedures', 'client/links/httpLink')).toBe(
      '../client/links/httpLink.md',
    );
    expect(relativeLink('introduction', 'server/routers')).toBe(
      './server/routers.md',
    );
  });
});

describe('jsxToHtml', () => {
  it('spells JSX attributes as HTML', () => {
    expect(
      jsxToHtml(
        "<img className=\"w-full\" style={{ maxWidth: '20rem', margin: 0, flexGrow: 1 }} />{' '}",
      ),
    ).toBe(
      '<img class="w-full" style="max-width: 20rem; margin: 0; flex-grow: 1px" /> ',
    );
    expect(styleOf("{ zIndex: '2', top: -4 }")).toBe('z-index: 2; top: -4px');
  });
});

describe('dropMissingAnchors', () => {
  it("drops the hash of links to headings that don't exist", () => {
    const anchors = new Map([
      ['server/routers', new Set(['merging'])],
      ['client/links', new Set<string>()],
    ]);
    const result = dropMissingAnchors(
      [
        '[a](./routers.md#merging) [b](./routers.md#gone)',
        '`[c](./routers.md#gone)`',
        '```md',
        '[d](../client/links.md#gone)',
        '```',
        '[e](../client/links.md#gone)',
      ].join('\n'),
      'server/procedures',
      anchors,
    );
    expect(result.markdown).toBe(
      [
        '[a](./routers.md#merging) [b](./routers.md)',
        '`[c](./routers.md#gone)`',
        '```md',
        '[d](../client/links.md#gone)',
        '```',
        '[e](../client/links.md)',
      ].join('\n'),
    );
    expect(result.dropped).toEqual([
      'server/procedures: ./routers.md#gone',
      'server/procedures: ../client/links.md#gone',
    ]);
  });
});

describe('sidebarSections', () => {
  it('makes top-level categories sections and nests the rest under their overview', () => {
    expect(
      sidebarSections([
        {
          items: [
            'main/introduction',
            { id: 'main/quickstart', label: 'Quickstart', type: 'doc' },
          ],
          label: 'tRPC',
          type: 'category',
        },
        {
          items: [
            {
              items: [
                'client/nextjs/overview',
                {
                  items: [
                    'client/nextjs/app-router/setup',
                    'client/nextjs/app-router/actions',
                  ],
                  label: 'App Router',
                  type: 'category',
                },
                'client/nextjs/starter-projects',
              ],
              label: 'Next.js',
              type: 'category',
            },
            {
              items: [{ type: 'link' }, 'client/headers'],
              label: 'Without an overview',
              type: 'category',
            },
          ],
          label: 'Client',
          type: 'category',
        },
        { type: 'link' },
      ]),
    ).toEqual({
      entries: [
        {
          id: 'main/introduction',
          label: undefined,
          order: 0,
          parent: undefined,
          section: 'tRPC',
        },
        {
          id: 'main/quickstart',
          label: 'Quickstart',
          order: 1,
          parent: undefined,
          section: 'tRPC',
        },
        {
          id: 'client/nextjs/overview',
          label: 'Next.js',
          order: 2,
          parent: undefined,
          section: 'Client',
        },
        {
          id: 'client/nextjs/app-router/setup',
          label: 'App Router',
          order: 3,
          parent: 'client/nextjs/overview',
          section: 'Client',
        },
        {
          id: 'client/nextjs/app-router/actions',
          label: undefined,
          order: 4,
          parent: 'client/nextjs/app-router/setup',
          section: 'Client',
        },
        {
          id: 'client/nextjs/starter-projects',
          label: undefined,
          order: 5,
          parent: 'client/nextjs/overview',
          section: 'Client',
        },
        {
          id: 'client/headers',
          label: undefined,
          order: 6,
          parent: undefined,
          section: 'Client',
        },
      ],
      sections: ['tRPC', 'Client'],
    });
  });
});
