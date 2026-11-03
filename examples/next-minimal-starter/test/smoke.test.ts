import { expect, test } from '@playwright/test';

test.setTimeout(35e3);

test('the greeting is server-rendered and the subscription streams', async ({
  page,
}) => {
  const greetingRequests: string[] = [];
  page.on('request', (req) => {
    if (req.url().includes('/api/trpc/greeting')) {
      greetingRequests.push(req.url());
    }
  });

  const res = await page.goto('/');
  expect(await res?.text()).toContain('hello Next.js');
  await expect(page.getByText('hello Next.js')).toBeVisible();

  await expect(page.getByText(/new data \(count: \d+/)).toBeVisible();

  // the prefetched greeting was hydrated, so the browser never fetched it
  expect(greetingRequests).toEqual([]);
});
