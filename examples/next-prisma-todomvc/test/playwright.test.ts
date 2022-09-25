import { test } from '@playwright/test';

test.setTimeout(35e3);

test('add todo', async ({ page }) => {
  await page.goto('/');

  const nonce = Math.random()
    .toString(36)
    .replace(/[^a-z]+/g, '')
    .slice(0, 6);
  await page.type('.new-todo', nonce);
  await page.keyboard.press('Enter');
  await page.waitForResponse('**/trpc/**');
  await page.waitForSelector(`text=${nonce}`);
});

export {};
