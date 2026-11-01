import { describe, expect, it } from '@effect/vitest';

import { manifestOf } from './old-docs-copy.ts';

describe('manifestOf', () => {
  it('lists each file with what was written from it, in code-unit order', () => {
    expect(
      manifestOf({
        notCopied: { 'docs/landing.md': 'The home page shows it' },
        sources: [
          'docs/server/routers.md',
          'docs/_partials/_intro.mdx',
          'docs/Zed.md',
          'docs/landing.md',
          'blog/2025-03-21-announcing-trpc-11.mdx',
        ],
        written: [
          ['docs/server/routers.md', 'v11/docs/server/routers.md'],
          ['docs/_partials/_intro.mdx', 'v11/docs/server/routers.md'],
          ['docs/_partials/_intro.mdx', 'v11/docs/client/links.md'],
          ['docs/Zed.md', 'v11/docs/zed.md'],
          [
            'blog/2025-03-21-announcing-trpc-11.mdx',
            'blog/announcing-trpc-v11.md',
          ],
          ['static/img/logo.svg', 'public/v11/img/logo.svg'],
          ['static/img/logo.svg', 'public/v10/img/logo.svg'],
        ],
      }),
    ).toEqual({
      manifest: {
        'blog/2025-03-21-announcing-trpc-11.mdx': [
          'blog/announcing-trpc-v11.md',
        ],
        'docs/Zed.md': ['v11/docs/zed.md'],
        'docs/_partials/_intro.mdx': [
          'v11/docs/client/links.md',
          'v11/docs/server/routers.md',
        ],
        'docs/landing.md': 'The home page shows it',
        'docs/server/routers.md': ['v11/docs/server/routers.md'],
        'static/img/logo.svg': [
          'public/v10/img/logo.svg',
          'public/v11/img/logo.svg',
        ],
      },
      problems: [],
    });
  });

  it('notes a partial no page includes', () => {
    expect(
      manifestOf({
        notCopied: {},
        sources: ['docs/partials/_unused.mdx'],
        written: [],
      }).manifest,
    ).toEqual({ 'docs/partials/_unused.mdx': 'A partial no page includes' });
  });

  it('fails on a file it neither copies nor leaves out on purpose', () => {
    expect(
      manifestOf({
        notCopied: {},
        sources: [
          'docs/server/new.md',
          'docs/client/diagram.svg',
          'blog/2026-10-01-post/index.mdx',
        ],
        written: [],
      }).problems,
    ).toEqual([
      'docs/server/new.md is in no sidebar: copy it, or say why not in `notCopied` in www/build/old-docs-copy.ts',
      "docs/client/diagram.svg isn't a page: copy it, or say why not in `notCopied` in www/build/old-docs-copy.ts",
      "blog/2026-10-01-post/index.mdx isn't a post the copy reads (`blog/<yyyy-mm-dd>-<slug>.mdx`): copy it, or say why not in `notCopied` in www/build/old-docs-copy.ts",
    ]);
  });

  it('fails on a `notCopied` entry that is copied or gone', () => {
    expect(
      manifestOf({
        notCopied: {
          'docs/gone.md': 'A test page',
          'docs/listed.md': 'No sidebar lists it',
        },
        sources: ['docs/listed.md'],
        written: [['docs/listed.md', 'v11/docs/listed.md']],
      }).problems,
    ).toEqual([
      'docs/listed.md is copied: take it out of `notCopied`',
      "docs/gone.md isn't there: take it out of `notCopied`",
    ]);
  });
});
