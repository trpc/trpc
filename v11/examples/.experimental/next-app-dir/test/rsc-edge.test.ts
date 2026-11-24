import { expect, test } from '@playwright/test';

test.setTimeout(35e3);

test('edge runtime server component can use createTRPCOptionsProxy', async ({
  page,
}) => {
  await page.goto('/rsc-edge');

  await expect(page.locator('h1')).toHaveText('Edge runtime');
  const queryKey = await page.textContent('#query-key');
  expect(JSON.parse(queryKey ?? '')).toEqual([
    ['greeting'],
    { input: { text: 'edge' }, type: 'query' },
  ]);
});
