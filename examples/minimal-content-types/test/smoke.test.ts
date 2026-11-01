import { expect, test } from '@playwright/test';

test.setTimeout(35e3);

test('sends FormData and a file', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Send FormData' }).click();
  await expect(page.getByText('tRPC Extraordinaire')).toBeVisible();

  await page.getByLabel('Send File').setInputFiles({
    name: 'hello.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('hello tRPC user'),
  });
  await expect(page.getByText('hello tRPC user')).toBeVisible();
});
