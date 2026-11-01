import { expect, test } from '@playwright/test';

test.setTimeout(35e3);

test('go to /', async ({ page }) => {
  await page.goto('/');

  await expect(
    page.getByRole('heading', { name: 'tRPC Minimal React' }),
  ).toBeVisible();
  await expect(page.getByText('hello tRPC user')).toBeVisible();
});

test('shows an error when the server is unreachable', async ({ page }) => {
  await page.route('http://localhost:2022/**', (route) => route.abort());
  await page.goto('/');

  await expect(page.getByRole('alert')).toContainText(
    "Couldn't load the greeting",
    { timeout: 20e3 },
  );
});
