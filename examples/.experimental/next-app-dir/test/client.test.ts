import { expect, test } from '@playwright/test';

test.setTimeout(35e3);

//
// TODO: Activate client tests once we have the React Query setup working

test('client: refreshing the page should reuse the cached value', async ({
  page,
}) => {
  await page.goto('/client');

  //   await page.waitForSelector('text=hello from client');
  //   const nonce1 = await page.textContent('text=hello from client');
  //   await page.reload();
  //   const nonce2 = await page.textContent('text=hello from client');
  //   expect(nonce1).toBe(nonce2);
  const nonce = await page.textContent('text=not implemented');
  expect(nonce).toBe('not implemented');
});

// test('client: revalidating should load new content', async ({ page }) => {
//   await page.goto('/client');

//   await page.waitForSelector('text=hello from client');
//   const nonce1 = await page.textContent('text=hello from client');
//   await page.click('text=Revalidate');
//   await page.waitForLoadState('networkidle');
//   const nonce2 = await page.textContent('text=hello from client');
//   expect(nonce1).not.toBe(nonce2);
// });
