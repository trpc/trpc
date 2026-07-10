import { expect, test } from '@playwright/test';

test.setTimeout(35e3);

// Initial page.reload is due to dev server having a more aggressive
// cache invalidation strategy.

test('server-cacheLink: refreshing the page should reuse the cached value', async ({
  page,
}) => {
  await page.goto('/rsc-links');
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
  await page.goto('/rsc-links');
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
