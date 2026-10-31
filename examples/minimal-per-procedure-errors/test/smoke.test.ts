import { expect, test } from '@playwright/test';

test.setTimeout(35e3);

test('go to /', async ({ page }) => {
  await page.goto('/');

  await page.waitForSelector(`text=tRPC user`);
});

test('a claimed error keeps its own shape', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'rate-limit' }).click();
  await expect(page.getByTestId('checkout-result')).toHaveText(
    'Rate limited — retry in 5000ms',
  );

  await page.getByRole('button', { name: 'payment-required' }).click();
  await expect(page.getByTestId('checkout-result')).toHaveText(
    'Payment required — $42.00 due',
  );
});

test('a declined error falls back to the global formatter', async ({
  page,
}) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'unrelated-failure' }).click();
  await expect(page.getByTestId('checkout-result')).toHaveText(
    'Unhandled by the procedure (global-errorFormatter): INTERNAL_SERVER_ERROR',
  );
});

test('a successful call still returns data', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'ok', exact: true }).click();
  await expect(page.getByTestId('checkout-result')).toHaveText(
    'Order order_1337',
  );
});

test('a handler registered before a throwing middleware catches it', async ({
  page,
}) => {
  await page.goto('/');

  await expect(page.getByTestId('maintenance-result')).toHaveText(
    'Down for maintenance until 2026-01-01T00:00:00.000Z',
  );
});

test('safe() returns the same shape as a value', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'run checkout' }).click();
  await expect(page.getByTestId('safe-result')).toHaveText(
    'Still owing $42.00',
  );
});
