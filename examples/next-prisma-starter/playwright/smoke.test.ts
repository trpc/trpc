import { test, expect } from '@playwright/test';

test.setTimeout(35e3);

test('go to /', async ({ page }) => {
  await page.goto('/');

  await page.waitForSelector(`text=Starter`);
});

test('test 404', async ({ page }) => {
  const res = await page.goto('/post/not-found');
  expect(res?.status()).toBe(404);
});

test('add a post', async ({ page }) => {
  const nonce = `${Math.random()}`;

  await page.goto('/');
  await page.fill(`[name=title]`, nonce);
  await page.fill(`[name=text]`, nonce);
  await page.click(`form [type=submit]`);
  await page.waitForLoadState('networkidle');

  await page.reload();
  expect(await page.content()).toContain(nonce);
});
