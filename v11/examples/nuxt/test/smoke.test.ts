import { expect, test } from '@playwright/test';

test('go to /', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading')).toHaveText('hello tRPC user');
});
