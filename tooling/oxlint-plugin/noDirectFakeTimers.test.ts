import { RuleTester } from 'oxlint/plugins-dev';
import { describe, it } from 'vitest';
import plugin from './index.ts';

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester({
  languageOptions: { parserOptions: { lang: 'ts' } },
});

const control = (name: string) =>
  `Call \`${name}()\` on the \`fakeTimersResource()\` that set up the fake timers, not on \`vi\``;

const message = (name: string) =>
  `\`vi.${name}()\` can leak fake timers into the next test - use \`using _timers = fakeTimersResource()\` from \`@trpc/server/__tests__/fakeTimersResource\``;

tester.run('no-direct-fake-timers', plugin.rules['no-direct-fake-timers']!, {
  valid: [
    '{ using _timers = fakeTimersResource(); }',
    'await timers.advanceTimersByTimeAsync(100);',
    'vi.waitFor(() => {});',
    'other.useFakeTimers();',
    'useFakeTimers();',
    'vi[useFakeTimers]();',
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
      code: "vi['useFakeTimers']();",
      errors: [{ message: message('useFakeTimers') }],
    },
    {
      code: 'vi["useRealTimers"]();',
      errors: [{ message: message('useRealTimers') }],
    },
    {
      code: 'vi.runAllTimers();',
      errors: [{ message: control('runAllTimers') }],
    },
    {
      code: 'await vi.advanceTimersByTimeAsync(100);',
      errors: [{ message: control('advanceTimersByTimeAsync') }],
    },
    {
      code: "expect(vi['getTimerCount']()).toBe(0);",
      errors: [{ message: control('getTimerCount') }],
    },
    {
      code: 'afterAll(() => { vi.useRealTimers(); });',
      errors: [{ message: message('useRealTimers') }],
    },
  ],
});
