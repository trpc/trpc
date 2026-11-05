import { existsSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { partnersBarExcluded, showsPartnersBar } from './partners-bar.ts';

describe('showsPartnersBar', () => {
  it('shows on the docs and the blog', () => {
    for (const path of [
      '/docs',
      '/docs/quickstart',
      '/docs/client/links/httpBatchLink',
      '/docs/v10/quickstart',
      '/docs/v9/quickstart',
      '/blog',
      '/blog/',
      '/blog/announcing-trpc-v11',
    ]) {
      expect(showsPartnersBar(path), path).toBe(true);
    }
  });

  it('hides where it would repeat the page or be out of place', () => {
    for (const path of [
      '/',
      '/sponsor',
      '/media',
      '/search',
      '/404',
      '/docs/community/sponsors',
      '/docs/community/sponsors/',
      '/docs/v10/community/sponsors',
      '/docs/v9/sponsors',
      '/docsearch',
      '/blogroll',
    ]) {
      expect(showsPartnersBar(path), path).toBe(false);
    }
  });

  it("excludes docs pages that exist, each version's sponsors page", () => {
    for (const path of partnersBarExcluded) {
      const [, , ...rest] = path.split('/');
      const version = rest[0] === 'v10' || rest[0] === 'v9' ? rest[0] : 'v11';
      const slug = version === 'v11' ? rest : rest.slice(1);
      expect(
        existsSync(
          new URL(`../${version}/docs/${slug.join('/')}.md`, import.meta.url),
        ),
        path,
      ).toBe(true);
    }
  });
});
