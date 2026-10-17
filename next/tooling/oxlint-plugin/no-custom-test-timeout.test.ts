import { RuleTester } from 'oxlint/plugins-dev';
import { describe, it } from 'vite-plus/test';

import plugin from './index.ts';

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester({
  languageOptions: { parserOptions: { lang: 'ts' } },
});

tester.run('no-custom-test-timeout', plugin.rules['no-custom-test-timeout']!, {
  valid: [
    `test('fast', async () => {
       await vi.waitFor(() => {
         expect(true).toBe(true);
       });
     });`,
    `test.skip('skipped', async () => {});`,
    `describe('suite', () => {
       it('case', () => {});
     });`,
    `setTimeout(() => {}, 5000);`,
    `vi.advanceTimersByTime(1500);`,
    `export default defineConfig({ test: { name: 'web' } });`,
    `await expect.poll(() => true).toBe(true);`,
    `const byKey = experimental_lock({ key: 'k', timeout: '1 second' });`,
    `const layer = durableLocker(ns, { timeout: '20 millis' });`,
    `async function waitFor(assertion, { timeout = 2000 } = {}) {}`,
  ],
  invalid: [
    {
      code: `test('slow', { timeout: 20_000 }, async () => {});`,
      errors: [{ messageId: 'banned' }],
    },
    {
      code: `test('slow', async () => {}, 20_000);`,
      errors: [{ messageId: 'banned' }],
    },
    {
      code: `it.skip('slow', async () => {}, 5000);`,
      errors: [{ messageId: 'banned' }],
    },
    {
      code: `test['skip']('slow', async () => {}, 5000);`,
      errors: [{ messageId: 'banned' }],
    },
    {
      code: `it.each([1])('slow %s', async () => {}, 5000);`,
      errors: [{ messageId: 'banned' }],
    },
    {
      code: `describe('suite', { timeout: 10_000 }, () => {});`,
      errors: [{ messageId: 'banned' }],
    },
    {
      code: `await vi.waitFor(() => {}, { timeout: 5000 });`,
      errors: [{ messageId: 'banned' }],
    },
    {
      code: `await expect.poll(() => true, { timeout: 4000 }).toBe(true);`,
      errors: [{ messageId: 'banned' }],
    },
    {
      code: `export default defineConfig({ test: { hookTimeout: 1, teardownTimeout: 2 } });`,
      errors: [{ messageId: 'banned' }, { messageId: 'banned' }],
    },
    {
      code: `vi.setConfig({ testTimeout: 30_000 });`,
      errors: [{ messageId: 'banned' }],
    },
  ],
});
