import { test, expect } from '@playwright/test';

test.setTimeout(35e3);

test('go to /', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading')).toHaveText('hello tRPC user');
})
