import { expect, test } from '@playwright/test';

test.setTimeout(35e3);

// FIXME: not sure why the cache always misses first try, adding a reload as setup for now

//
// TODO: Activate client tests once we have the React Query setup working

// test('client: refreshing the page should reuse the cached value', async ({
//   page,
// }) => {
//   await page.goto('/client');

//   await page.waitForSelector('text=hello from client');
//   const nonce1 = await page.textContent('text=hello from client');
//   await page.reload();
//   const nonce2 = await page.textContent('text=hello from client');
//   expect(nonce1).toBe(nonce2);
// });

// test('client: revalidating should load new content', async ({ page }) => {
//   await page.goto('/client');

//   await page.waitForSelector('text=hello from client');
//   const nonce1 = await page.textContent('text=hello from client');
//   await page.click('text=Revalidate');
//   await page.waitForLoadState('networkidle');
//   const nonce2 = await page.textContent('text=hello from client');
//   expect(nonce1).not.toBe(nonce2);
// });

test('server-httpLink: refreshing the page should reuse the cached value', async ({
  page,
}) => {
  await page.goto('/rsc');
  await page.reload();

  await page.waitForSelector('text=hello from server');
  const nonce1 = await page.textContent('text=hello from server');
  await page.reload();
  const nonce2 = await page.textContent('text=hello from server');
  expect(nonce1).toBe(nonce2);
});

test('server-httpLink: revalidating should load new content', async ({
  page,
}) => {
  await page.goto('/rsc');
  await page.reload();

  await page.waitForSelector('text=hello from server');
  const nonce1 = await page.textContent('text=hello from server');
  await page.click('text=Revalidate HTTP');
  await page.waitForLoadState('networkidle');
  const nonce2 = await page.textContent('text=hello from server');
  expect(nonce1).not.toBe(nonce2);
});

test('server-cacheLink: refreshing the page should reuse the cached value', async ({
  page,
}) => {
  await page.goto('/rsc');
  await page.reload();

  await page.waitForSelector('text=hello i never hit an api endpoint');
  const nonce1 = await page.textContent(
    'text=hello i never hit an api endpoint',
  );
  await page.reload();
  const nonce2 = await page.textContent(
    'text=hello i never hit an api endpoint',
  );
  expect(nonce1).toBe(nonce2);
});

test('server-cacheLink: revalidating should load new content', async ({
  page,
}) => {
  await page.goto('/rsc');
  await page.reload();

  await page.waitForSelector('text=hello i never hit an api endpoint');
  const nonce1 = await page.textContent(
    'text=hello i never hit an api endpoint',
  );
  await page.click('text=Revalidate Cache');
  await page.waitForLoadState('networkidle');
  const nonce2 = await page.textContent(
    'text=hello i never hit an api endpoint',
  );
  expect(nonce1).not.toBe(nonce2);
});
