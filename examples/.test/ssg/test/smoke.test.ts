import { test } from '@playwright/test';

test('add todo', async ({ page }) => {
  await page.goto('/');
  expect(await page.content()).toContain('hello world');
});
