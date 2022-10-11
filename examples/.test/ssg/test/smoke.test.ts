import { test } from '@playwright/test';

test('query should be prefetched', async ({ page }) => {
  await page.goto('/');

  await page.waitForSelector('text=hello client');
});

test('dates should be serialized', async ({ page }) => {
  await page.goto('/');

  await page.waitForSelector('text=2022');
});
