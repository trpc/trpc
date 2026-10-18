import { describe, expect, it } from '@effect/vitest';

import {
  type CopiedDocs,
  type CopiedPage,
  type CopiedPost,
  convertPage,
  convertPost,
  convertSnippet,
  dropMissingAnchors,
  externalUrl,
  jsxToHtml,
  plainProse,
  redirected,
  type Release,
  relativeLink,
  resolveLink,
  searchParamsUrl,
  sidebarSections,
  styleOf,
} from './old-docs-convert.ts';

const page = (
  slug: string,
  file: string,
  fields: Partial<CopiedPage> = {},
): CopiedPage => ({
  description: `About ${slug}`,
  file,
  label: undefined,
  order: 0,
  parent: undefined,
  section: 'Backend Usage',
  slug,
  title: slug,
  version: 'v11',
  ...fields,
});

const pages = [
  page('introduction', 'docs/main/introduction.mdx'),
  page('server/procedures', 'docs/server/procedures.md'),
  page('server/routers', 'docs/server/routers.md'),
  page('client/links', 'docs/client/links/overview.md'),
  page('community/awesome-trpc', 'docs/community/awesome-trpc.md'),
  page('introduction', 'versioned_docs/version-10.x/main/introduction.mdx', {
    version: 'v10',
  }),
  page('server/routers', 'versioned_docs/version-10.x/server/routers.md', {
    version: 'v10',
  }),
  page('example-apps', 'versioned_docs/version-10.x/main/example-apps.mdx', {
    version: 'v10',
  }),
  page('nextjs', 'versioned_docs/version-9.x/nextjs/introduction.md', {
    version: 'v9',
  }),
];

const posts: ReadonlyArray<CopiedPost> = [
  {
    authors: [
      {
        image: 'https://github.com/KATT.png',
        name: 'Alex / KATT',
        title: 'Creator of tRPC',
        url: undefined,
      },
    ],
    date: '2025-03-21',
    discussion: 6622,
    file: 'blog/2025-03-21-announcing-trpc-11.mdx',
    slug: 'announcing-trpc-v11',
    title: 'Announcing tRPC v11',
  },
];

const redirects = [
  {
    destination: '/blog/announcing-trpc-v11',
    source: '/blog/announcing-trpc-11',
  },
  { destination: '/docs/community/awesome-trpc', source: '/docs/awesome-trpc' },
  { destination: '/docs/:path*', source: '/docs/v11/:path*' },
  { destination: 'https://discord.gg/trpc', source: '/discord' },
];

const docsOf = (files: Record<string, string>): CopiedDocs => ({
  files: new Map(Object.entries(files)),
  pages,
  posts,
  redirects,
  releases: new Map([
    [
      'v10',
      {
        paths: new Set([
          'examples/minimal',
          'packages/client/src/links/wsLink.ts',
        ]),
        tag: 'v10.45.4',
      },
    ],
  ]),
  unlisted: new Map([['docs/further/old.md', '/docs/further/old']]),
});

/** Converts `body` as the page at `index` in `pages`, among `files`. */
function convert(body: string, files: Record<string, string> = {}, index = 1) {
  const target = pages[index] ?? page('', '');
  const converted = convertPage(
    target,
    docsOf({ ...files, [target.file]: body }),
  );
  return {
    ...converted,
    body: converted.markdown.replace(/^---\n[\s\S]*?\n---\n\n/, ''),
  };
}

describe('convertPage', () => {
  it('writes the frontmatter, with the label only where it differs', () => {
    expect(
      convertPage(
        page('a', 'docs/a.md', {
          label: 'Short',
          order: 3,
          section: 'tRPC',
          title: 'A "quoted" title',
        }),
        docsOf({ 'docs/a.md': '---\nid: a\n---\n\nHello.\n' }),
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

  it('closes an admonition reopened by mistake, which Docusaurus nests the page in', () => {
    const converted = convert(
      [
        ':::tip',
        'Careful!',
        ':::tip',
        '',
        '## Next',
        '',
        ':::note',
        'Ok.',
        ':::',
      ].join('\n'),
    );
    expect(converted.problems).toEqual([]);
    expect(converted.body).toBe(
      [
        '> [!TIP]',
        '> Careful!',
        '',
        '## Next',
        '',
        '> [!NOTE]',
        '> Ok.',
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
        "```TS twoslash title='server.ts'",
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

  it('points links at the copied pages of any version, or else at trpc.io', () => {
    const converted = convert(
      [
        '[Routers](./routers.md#merging), [links](/docs/client/links),',
        '[intro](/docs), [v9](../../versioned_docs/version-9.x/nextjs/introduction.md#hooks),',
        '[v10](https://trpc.io/docs/v10/server/routers), [awesome](/docs/awesome-trpc#list),',
        '[old](../further/old.md), [chat](https://trpc.io/discord),',
        '[blog](/blog/announcing-trpc-v11) and [npm](https://npmjs.com).',
        '<a href="../client/links">Links</a>',
        '![Diagram](/img/links-diagram.svg)',
        '<img src="/v11/img/split-link-diagram.svg" />',
      ].join('\n'),
    );
    expect(converted.problems).toEqual([]);
    expect(converted.body).toBe(
      [
        '[Routers](./routers.md#merging), [links](../client/links.md),',
        '[intro](../introduction.md), [v9](/v9/docs/nextjs#hooks),',
        '[v10](/v10/docs/server/routers), [awesome](../community/awesome-trpc.md#list),',
        '[old](https://trpc.io/docs/further/old), [chat](https://trpc.io/discord),',
        '[blog](/blog/announcing-trpc-v11) and [npm](https://npmjs.com).',
        '<a href="/v11/docs/client/links">Links</a>',
        '![Diagram](/v11/img/links-diagram.svg)',
        '<img src="/v11/img/split-link-diagram.svg" />',
        '',
      ].join('\n'),
    );
    expect(converted.images).toEqual(['static/img/links-diagram.svg']);
  });

  it("points an older version's `/docs/` links at its own pages, where it has them", () => {
    const converted = convert(
      [
        '[routers](/docs/server/routers), [procedures](/docs/server/procedures),',
        '[v11 routers](/docs/v11/server/routers), [apps](/main/example-apps.mdx),',
        '![Diagram](/img/links-diagram.svg)',
      ].join('\n'),
      {},
      6,
    );
    expect(converted.problems).toEqual([]);
    expect(converted.body).toBe(
      [
        '[routers](./routers.md), [procedures](/v11/docs/server/procedures),',
        '[v11 routers](/v11/docs/server/routers), [apps](../example-apps.md),',
        '![Diagram](/v10/img/links-diagram.svg)',
        '',
      ].join('\n'),
    );
  });

  it("pins an older version's links to the repo at its release, and links what moved", () => {
    const converted = convert(
      [
        '[ws](https://github.com/trpc/trpc/blob/main/packages/client/src/links/wsLink.ts),',
        '[gone](https://github.com/trpc/trpc/blob/main/packages/gone.ts),',
        '| Beam | https://github.com/planetscale/beam |',
      ].join('\n'),
      {},
      6,
    );
    expect(converted.body).toBe(
      [
        '[ws](https://github.com/trpc/trpc/blob/v10.45.4/packages/client/src/links/wsLink.ts),',
        '[gone](https://github.com/trpc/trpc/blob/main/packages/gone.ts),',
        '| Beam | https://web.archive.org/web/20231212214304/https://github.com/planetscale/beam |',
        '',
      ].join('\n'),
    );
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
    expect(converted.inlined).toEqual([
      'docs/partials/_intro.mdx',
      'src/components/Logo.tsx',
    ]);
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

  it('turns the StackBlitz embed into an iframe', () => {
    const converted = convert(
      [
        "import { Iframe } from '@site/src/components/Iframe';",
        "import { searchParams } from '@site/src/utils/searchParams';",
        "import clsx from 'clsx';",
        '',
        '<div',
        '  className={clsx(',
        "    'relative h-[800px] w-full',",
        '  )}',
        '>',
        '  <Iframe',
        '    src={',
        '      `https://stackblitz.com/github/trpc/trpc/tree/main/examples/minimal?` +',
        '      searchParams({',
        "        embed: '1',",
        "        file: ['client/index.ts', 'server/index.ts'],",
        '      })',
        '    }',
        '    frameBorder="0"',
        '  />',
        '</div>',
      ].join('\n'),
      {},
      6,
    );
    expect(converted.problems).toEqual([]);
    expect(converted.body).toBe(
      '<iframe src="https://stackblitz.com/github/trpc/trpc/tree/v10.45.4/examples/minimal?embed=1&file=client%2Findex.ts&file=server%2Findex.ts" title="StackBlitz" style="width: 100%; height: 800px; border: 0; border-radius: 0.75rem" loading="lazy"></iframe>\n',
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

describe('convertPost', () => {
  const post = posts[0] ?? ({} as never);
  const convert = (body: string) =>
    convertPost(post, docsOf({ [post.file]: body }));

  it('writes the frontmatter, with its first paragraph as its description', () => {
    expect(
      convert(
        [
          '---',
          'slug: announcing-trpc-v11',
          'title: Announcing tRPC v11',
          '---',
          '',
          'Today, we are _finally_ shipping [v11](/docs)',
          'with `@trpc/server`!',
          '',
          '{/* truncate */}',
          '',
          '## Upgrading',
        ].join('\n'),
      ),
    ).toEqual({
      images: [],
      inlined: [],
      markdown: [
        '---',
        'title: "Announcing tRPC v11"',
        'description: "Today, we are finally shipping v11 with @trpc/server!"',
        'date: "2025-03-21"',
        'authors: [{"image":"https://github.com/KATT.png","name":"Alex / KATT","title":"Creator of tRPC"}]',
        'discussion: 6622',
        '---',
        '',
        'Today, we are _finally_ shipping [v11](/v11/docs/introduction)',
        'with `@trpc/server`!',
        '',
        '## Upgrading',
        '',
      ].join('\n'),
      problems: [],
    });
  });

  it("links pages by their paths, in the version trpc.io's blog means", () => {
    const converted = convert(
      [
        'See [routers](/docs/server/routers), [v10](/docs/v10/server/routers),',
        '[the post](./2025-03-21-announcing-trpc-11.mdx#upgrading),',
        'and [the old one](/blog/announcing-trpc-11).',
      ].join('\n'),
    );
    expect(converted.problems).toEqual([]);
    expect(converted.markdown.replace(/^---\n[\s\S]*?\n---\n\n/, '')).toBe(
      [
        'See [routers](/v11/docs/server/routers), [v10](/v10/docs/server/routers),',
        '[the post](/blog/announcing-trpc-v11#upgrading),',
        'and [the old one](/blog/announcing-trpc-v11).',
        '',
      ].join('\n'),
    );
  });

  it('links an embedded post on X, or says that it was deleted', () => {
    const converted = convert(
      [
        "import { Tweet } from 'react-tweet';",
        '',
        'Shipped:',
        '',
        '<Tweet id="123" />',
        '',
        'As Dan put it:',
        '',
        '<div className="flex justify-center">',
        '  <Tweet id="1756120297529368801" />',
        '</div>',
      ].join('\n'),
    );
    expect(converted.problems).toEqual([]);
    expect(converted.markdown.replace(/^---\n[\s\S]*?\n---\n\n/, '')).toBe(
      [
        'Shipped:',
        '',
        '[View the post on X](https://x.com/i/status/123)',
        '',
        'As Dan put it:',
        '',
        '> [!NOTE] Post deleted',
        "> Dan Abramov's post on X that was embedded here has since been deleted.",
        '',
      ].join('\n'),
    );
  });

  it("reports a post that doesn't open with a paragraph", () => {
    expect(convert('## Hello').problems).toEqual([
      "blog/2025-03-21-announcing-trpc-11.mdx: doesn't open with a paragraph",
    ]);
  });
});

describe('convertSnippet', () => {
  it("writes plain code, as trpc.io's home page shows it, with no frontmatter", () => {
    const converted = convertSnippet(
      'docs/landing-intro/Step3.md',
      docsOf({
        'docs/landing-intro/Step3.md': [
          '```twoslash include server',
          '// @filename: server.ts',
          'export const appRouter = {};',
          '```',
          '',
          '```ts twoslash',
          '// @include: server',
          '// @filename: client.ts',
          '// ---cut---',
          'const res = await trpc.greeting.query();',
          '//    ^?',
          '```',
        ].join('\n'),
      }),
    );
    expect(converted.problems).toEqual([]);
    expect(converted.markdown).toBe(
      '```ts\nconst res = await trpc.greeting.query();\n```\n',
    );
  });
});

describe('plainProse', () => {
  it('keeps the text of links, emphasis and code, and drops images and HTML', () => {
    expect(
      plainProse(
        '**Bold** and _em_ [link](https://a.b) `code` snake_case_name ![x](y.png) <small>small</small>',
      ),
    ).toBe('Bold and em link code snake_case_name small');
  });
});

describe('resolveLink', () => {
  const context = {
    docs: docsOf({}),
    file: 'docs/server/procedures.md',
    page: { slug: 'server/procedures', version: 'v11' },
  } as const;

  it('resolves file paths from the file, and URLs from the page', () => {
    expect(resolveLink('../client/links/overview.md', context)).toEqual({
      hash: '',
      kind: 'page',
      slug: 'client/links',
      version: 'v11',
    });
    expect(resolveLink('routers#lazy', context)).toEqual({
      hash: 'lazy',
      kind: 'page',
      slug: 'server/routers',
      version: 'v11',
    });
    expect(resolveLink('https://trpc.io/docs', context)).toEqual({
      hash: '',
      kind: 'page',
      slug: 'introduction',
      version: 'v11',
    });
    expect(resolveLink('https://trpc.io/docs/v10', context)).toEqual({
      hash: '',
      kind: 'page',
      slug: 'introduction',
      version: 'v10',
    });
  });

  it('follows trpc.io’s redirects, and leaves the site where they do', () => {
    expect(resolveLink('/docs/v11/server/routers', context)).toEqual({
      hash: '',
      kind: 'page',
      slug: 'server/routers',
      version: 'v11',
    });
    expect(resolveLink('/discord', context)).toEqual({
      kind: 'url',
      url: 'https://trpc.io/discord',
    });
  });

  it("resolves a post's file and its URL, after redirects, and a post's own links from the blog", () => {
    expect(
      resolveLink(
        '../../blog/2025-03-21-announcing-trpc-11.mdx#intro',
        context,
      ),
    ).toEqual({ hash: 'intro', kind: 'post', slug: 'announcing-trpc-v11' });
    expect(resolveLink('/blog/announcing-trpc-11', context)).toEqual({
      hash: '',
      kind: 'post',
      slug: 'announcing-trpc-v11',
    });
    const fromPost = {
      docs: context.docs,
      file: 'blog/2025-03-21-announcing-trpc-11.mdx',
      page: { blog: true, slug: 'announcing-trpc-v11', version: 'v11' },
    } as const;
    expect(
      resolveLink('./2025-03-21-announcing-trpc-11.mdx', fromPost),
    ).toEqual({ hash: '', kind: 'post', slug: 'announcing-trpc-v11' });
    expect(resolveLink('other-post', fromPost)).toEqual({
      kind: 'url',
      url: 'https://trpc.io/blog/other-post',
    });
  });

  it('leaves anchors, other sites and the copied images alone', () => {
    expect(resolveLink('#options', context)).toBeUndefined();
    expect(resolveLink('https://github.com/trpc', context)).toBeUndefined();
    expect(resolveLink('/v9/img/logo.svg', context)).toBeUndefined();
  });
});

describe('redirected', () => {
  it('follows redirects, with their params', () => {
    expect(
      redirected('/docs/reactjs/useQuery/', [
        {
          destination: '/docs/client/react/:path',
          source: '/docs/reactjs/:path',
        },
        { destination: '/docs/v11/:path*', source: '/docs/client/:path*' },
        { destination: '/docs/:path*', source: '/docs/v11/:path*' },
      ]),
    ).toBe('/docs/react/useQuery');
    expect(redirected('/docs/x', [])).toBe('/docs/x');
    expect(
      redirected('/sponsor', [
        { destination: 'https://github.com/sponsors/KATT', source: '/sponsor' },
      ]),
    ).toBeUndefined();
  });
});

describe('externalUrl', () => {
  const release: Release = {
    paths: new Set(['examples/minimal', 'packages/server/src/index.ts']),
    tag: 'v9.27.4',
  };

  it("pins links to the repo's main to the release, where it has the file", () => {
    expect(
      externalUrl(
        'https://github.com/trpc/trpc/tree/main/examples/minimal/',
        release,
      ),
    ).toBe('https://github.com/trpc/trpc/tree/v9.27.4/examples/minimal/');
    expect(
      externalUrl(
        'https://codesandbox.io/s/github/trpc/trpc/tree/main/examples/minimal?file=/a.ts',
        release,
      ),
    ).toBe(
      'https://codesandbox.io/s/github/trpc/trpc/tree/v9.27.4/examples/minimal?file=/a.ts',
    );
    expect(
      externalUrl('https://github.com/trpc/trpc/blob/main/README.md', release),
    ).toBe('https://github.com/trpc/trpc/blob/main/README.md');
    expect(
      externalUrl(
        'https://github.com/trpc/trpc/tree/main/examples/minimal',
        undefined,
      ),
    ).toBe('https://github.com/trpc/trpc/tree/main/examples/minimal');
  });

  it('links what moved where it is now', () => {
    expect(externalUrl('http://hilde.gg', undefined)).toBe(
      'https://github.com/nehalist/hilde',
    );
  });
});

describe('searchParamsUrl', () => {
  it('builds the URL as `searchParams` does, or gives up on anything else', () => {
    expect(
      searchParamsUrl(
        "`https://a.io/?` + searchParams({ a: '1', // a comment\n b: ['x/y', 'z'] })",
      ),
    ).toBe('https://a.io/?a=1&b=x%2Fy&b=z');
    expect(searchParamsUrl("`https://a.io/?` + other({ a: '1' })")).toBe(
      undefined,
    );
    expect(searchParamsUrl('`https://a.io/?` + searchParams({ a: b })')).toBe(
      undefined,
    );
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
  it("drops the hash of links to headings that don't exist, in any version", () => {
    const anchors = new Map([
      ['v11:server/routers', new Set(['merging'])],
      ['v11:client/links', new Set<string>()],
      ['v9:nextjs', new Set(['hooks'])],
    ]);
    const result = dropMissingAnchors(
      [
        '[a](./routers.md#merging) [b](./routers.md#gone)',
        '`[c](./routers.md#gone)`',
        '```md',
        '[d](../client/links.md#gone)',
        '```',
        '[e](../client/links.md#gone)',
        '[f](/v9/docs/nextjs#hooks) [g](/v9/docs/nextjs#gone)',
        '<a href="/v11/docs/client/links#gone">h</a>',
      ].join('\n'),
      { slug: 'server/procedures', version: 'v11' },
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
        '[f](/v9/docs/nextjs#hooks) [g](/v9/docs/nextjs)',
        '<a href="/v11/docs/client/links">h</a>',
      ].join('\n'),
    );
    expect(result.dropped).toEqual([
      'v11 server/procedures: ./routers.md#gone',
      'v11 server/procedures: ../client/links.md#gone',
      'v11 server/procedures: /v9/docs/nextjs#gone',
      'v11 server/procedures: /v11/docs/client/links#gone',
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

  it('opens a category with the doc it links, or with a generated index of its items', () => {
    expect(
      sidebarSections([
        {
          items: ['main/quickstart'],
          label: 'tRPC',
          link: { id: 'main/introduction', type: 'doc' },
          type: 'category',
        },
        {
          items: [
            'server/routers',
            {
              items: ['server/adapters/express'],
              label: 'Adapters',
              link: { id: 'server/adapters/overview', type: 'doc' },
              type: 'category',
            },
          ],
          label: 'Backend Usage',
          link: {
            slug: '/server/introduction',
            title: 'tRPC server documentation',
            type: 'generated-index',
          },
          type: 'category',
        },
        'migration/migrate-from-v9-to-v10',
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
          label: undefined,
          order: 1,
          parent: undefined,
          section: 'tRPC',
        },
        {
          id: 'index:server/introduction',
          index: {
            description: '',
            items: ['server/routers', 'server/adapters/overview'],
            slug: 'server/introduction',
            title: 'tRPC server documentation',
          },
          label: undefined,
          order: 2,
          parent: undefined,
          section: 'Backend Usage',
        },
        {
          id: 'server/routers',
          label: undefined,
          order: 3,
          parent: undefined,
          section: 'Backend Usage',
        },
        {
          id: 'server/adapters/overview',
          label: 'Adapters',
          order: 4,
          parent: undefined,
          section: 'Backend Usage',
        },
        {
          id: 'server/adapters/express',
          label: undefined,
          order: 5,
          parent: 'server/adapters/overview',
          section: 'Backend Usage',
        },
        {
          id: 'migration/migrate-from-v9-to-v10',
          label: undefined,
          order: 6,
          parent: undefined,
          section: '',
        },
      ],
      sections: ['tRPC', 'Backend Usage', ''],
    });
  });
});
