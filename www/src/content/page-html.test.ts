import { expect, test } from 'vitest';

import {
  dehydratePages,
  hydratePages,
  loadPage,
  pageHtml,
  registerPages,
} from './page-html.ts';

const page = (html: string) => () =>
  Promise.resolve({ default: { html, slug: 'a-page', title: 'A page' } });

test('a loaded page leaves its HTML out of what its loader returns', async () => {
  const loaded = await loadPage('pages/loaded.md', page('<p>Loaded</p>'));
  expect(loaded).toEqual({
    htmlKey: 'pages/loaded.md',
    slug: 'a-page',
    title: 'A page',
  });
  expect(pageHtml(loaded)).toBe('<p>Loaded</p>');
});

test("reading a page's HTML before it loads throws", () => {
  expect(() => pageHtml({ htmlKey: 'pages/never.md' })).toThrow(
    'pages/never.md renders before its module has loaded',
  );
});

test('the pages the server rendered load in the browser before it hydrates', async () => {
  registerPages({ 'pages/hydrated.md': page('<p>Hydrated</p>') });
  // As the server's loader data reaches the browser, without the HTML.
  const router = {
    state: {
      matches: [
        { loaderData: undefined },
        {
          loaderData: { doc: { htmlKey: 'pages/hydrated.md', slug: 'a-page' } },
        },
      ],
    },
  };
  const dehydrated = dehydratePages(router);
  expect(dehydrated).toEqual({ pages: ['pages/hydrated.md'] });
  await hydratePages(dehydrated);
  expect(pageHtml({ htmlKey: 'pages/hydrated.md' })).toBe('<p>Hydrated</p>');
});
