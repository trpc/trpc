import { test } from '@playwright/test';

test.setTimeout(35e3);

test('go to /', async ({ page }) => {
  await page.goto('/');

  await page.waitForSelector(`text=hello user with token undefined`);

  await page.click('button');

  await page.waitForSelector(`text=hello user with token custom-token`);
});
