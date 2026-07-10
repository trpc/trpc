import { expect, test } from '@playwright/test';

test('query should be prefetched', async ({ page }) => {
  await page.goto('/');

  /**
   * Since we're prefetching the query, and have JavaScript disabled,
   * the data should be available immediately
   */
  expect(await page.textContent('h1')).toBe('hello client');
});

test('dates should be serialized', async ({ page }) => {
  /**
   * This test itself doesn't really test the serialization.
   * But if it succeeds, it means we didn't get an error when
   * accessing the .toDateString() method on the date.
   */
  await page.goto('/');

  expect(await page.textContent('p')).toBe('Sat Jan 01 2022');
});
