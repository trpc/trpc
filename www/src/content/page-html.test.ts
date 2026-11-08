// @vitest-environment jsdom
import { expect, test, vi } from 'vitest';

import {
  dehydratePages,
  hydratePages,
  loadPage,
  pageHtml,
  registerPages,
  reloadWindow,
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
  await hydratePages(dehydrated, () => {
    throw new Error('reloaded');
  });
  expect(pageHtml({ htmlKey: 'pages/hydrated.md' })).toBe('<p>Hydrated</p>');
});

test('a page that fails to load is tried once more before it hydrates', async () => {
  const load = vi
    .fn<ReturnType<typeof page>>()
    .mockRejectedValueOnce(new Error('offline'))
    .mockImplementation(page('<p>Retried</p>'));
  registerPages({ 'pages/retried.md': load });
  const reload = vi.fn<() => void>();
  await hydratePages({ pages: ['pages/retried.md'] }, reload);
  expect(load).toHaveBeenCalledTimes(2);
  expect(reload).not.toHaveBeenCalled();
  expect(pageHtml({ htmlKey: 'pages/retried.md' })).toBe('<p>Retried</p>');
});

test('a page that keeps failing reloads once, then gives up', async () => {
  const offline = new Error('offline');
  registerPages({ 'pages/gone.md': () => Promise.reject(offline) });
  const reload = vi.fn<() => void>();
  // Never settles: the page is reloading.
  void hydratePages({ pages: ['pages/gone.md'] }, reload);
  await vi.waitFor(() => {
    expect(reload).toHaveBeenCalledTimes(1);
  });
  // After the reload, it fails again.
  await expect(hydratePages({ pages: ['pages/gone.md'] }, reload)).rejects.toBe(
    offline,
  );
  expect(reload).toHaveBeenCalledTimes(1);
});

test("an old reload's mark doesn't stop a later visit's reload", async () => {
  registerPages({
    'pages/later.md': () => Promise.reject(new Error('offline')),
  });
  // A reload for this page, whose reader left before it hydrated.
  sessionStorage.setItem(
    'trpc-docs:reloaded-for:pages/later.md',
    String(Date.now() - reloadWindow),
  );
  const reload = vi.fn<() => void>();
  void hydratePages({ pages: ['pages/later.md'] }, reload);
  await vi.waitFor(() => {
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
