import { expect, test } from '@playwright/test';

test('query should be prefetched', async ({ page, javaScriptEnabled }) => {
  javaScriptEnabled = false;
  await page.goto('/');

  /**
   * Since we're prefetching the query the data should be 
   * available immediately
   */
  expect(await page.textContent('text=First Post')).toBeTruthy();
});

test('can fetch more data 4 times', async ({ page }) => {
  await page.goto('/');

  const loadMore = page.getByTestId('load-more');

  expect(await page.textContent('text=First Post')).toBeTruthy();
  await loadMore.click();

  expect(await page.textContent('text=Fourth Post')).toBeTruthy();
  await loadMore.click();

  expect(await page.textContent('text=Seventh Post')).toBeTruthy();
  await loadMore.click();

  expect(await page.textContent('text=Tenth Post')).toBeTruthy();
  await loadMore.click();

  expect(await page.textContent('text=Thirteenth Post')).toBeTruthy();
  expect(await loadMore.textContent()).toBe('No more posts to fetch');
  expect(await loadMore.isDisabled()).toBeTruthy();
});
