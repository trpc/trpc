import { expect, test } from '@nuxt/test-utils/playwright';

test('go to /', async ({ page, goto }) => {
  await goto('/', { waitUntil: 'hydration' });

  await expect(page.getByRole('heading')).toHaveText('hello tRPC user');
})
