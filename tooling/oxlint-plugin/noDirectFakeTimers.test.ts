import { RuleTester } from 'oxlint/plugins-dev';
import { describe, it } from 'vitest';
import plugin from './index.ts';

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester({
  languageOptions: { parserOptions: { lang: 'ts' } },
});

const message = (name: string) =>
  `\`vi.${name}()\` can leak fake timers into the next test - use \`using _timers = fakeTimersResource()\` from \`@trpc/server/__tests__/fakeTimersResource\``;

tester.run('no-direct-fake-timers', plugin.rules['no-direct-fake-timers']!, {
  valid: [
    '{ using _timers = fakeTimersResource(); }',
    'await vi.advanceTimersByTimeAsync(100);',
    'other.useFakeTimers();',
    'useFakeTimers();',
  ],
  invalid: [
    {
      code: 'vi.useFakeTimers();',
      errors: [{ message: message('useFakeTimers') }],
    },
    {
      code: 'vi.useFakeTimers({ now: 0 });',
      errors: [{ message: message('useFakeTimers') }],
    },
    {
      code: 'afterAll(() => { vi.useRealTimers(); });',
      errors: [{ message: message('useRealTimers') }],
    },
  ],
});
