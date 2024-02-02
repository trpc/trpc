import { test, expect } from '@playwright/test';

test.setTimeout(35e3);

test('go to /', async ({ page }) => {
  await page.goto('/');

  await page.waitForSelector(`text=Starter`);
});

test('add a post', async ({ page, browser }) => {
  const nonce = `${Math.random()}`;

  await page.goto('/');
  await page.fill(`[name=title]`, nonce);
  await page.fill(`[name=text]`, nonce);
  await page.click(`form [type=submit]`);
  await page.waitForLoadState('networkidle');
  await page.reload();

  expect(await page.content()).toContain(nonce);

  const ssrContext = await browser.newContext();
  const ssrPage = await ssrContext.newPage();
  await ssrPage.goto('/');

  expect(await ssrPage.content()).toContain(nonce);
});
