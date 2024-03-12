import { expect, test } from '@playwright/test';

test.setTimeout(35e3);

// Initial page.reload is due to dev server having a more aggressive
// cache invalidation strategy.

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
  await page.click('text=Revalidate Cache 1');
  await page.waitForLoadState('networkidle');
  const nonce2 = await page.textContent(
    'text=hello i never hit an api endpoint',
  );
  expect(nonce1).not.toBe(nonce2);
});

test('server-cacheLink: different contexts should not have a common cache', async ({
  page,
}) => {
  // mocking session data
  await page.setExtraHTTPHeaders({ 'x-trpc-user-id': 'foo' });
  await page.goto('/rsc');
  await page.reload();

  await page.waitForSelector('text=hello i never hit a private api endpoint');
  const nonce1 = await page.textContent(
    'text=hello i never hit a private api endpoint',
  );
  await page.reload();
  const nonce2 = await page.textContent(
    'text=hello i never hit a private api endpoint',
  );
  expect(nonce1).toBe(nonce2);

  // Mock new user
  await page.setExtraHTTPHeaders({ 'x-trpc-user-id': 'bar' });
  await page.reload();
  const nonce3 = await page.textContent(
    'text=hello i never hit a private api endpoint',
  );
  expect(nonce1).not.toBe(nonce3);
});
