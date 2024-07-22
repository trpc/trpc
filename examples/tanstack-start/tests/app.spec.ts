import { expect, test } from '@playwright/test';

test('Navigating to post', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Posts' }).click();
  await page.getByRole('link', { name: 'sunt aut facere repe' }).click();
  await page.getByRole('link', { name: 'Deep View' }).click();
  await expect(page.getByRole('heading')).toContainText('sunt aut facere');
});

test('Navigating to a not-found route', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'This Route Does Not Exist' }).click();
  await page.getByRole('link', { name: 'Start Over' }).click();
  await expect(page.getByRole('heading')).toContainText('Welcome Home!');
});
