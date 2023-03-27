import { expect, test } from '@playwright/test';

test('query should be prefetched', async ({ page }) => {
  await page.goto('/');

  /**
   * Since we're prefetching the query, and have JavaScript disabled,
   * the data should be available immediately
   */
  expect(await page.textContent('h1')).toBe('hello client');
});


test('issue 4084: 404 should 404', async ({ page }) => {
  const res = await page.goto('/not-found');
  expect(res?.status()).toBe(404);
  const text = await res?.text();
  expect(text).toContain('404');
  expect(text).toContain('This page could not be found');
});
