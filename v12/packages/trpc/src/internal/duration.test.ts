import { Duration } from 'effect';
import { expect, test } from 'vite-plus/test';
import { timerOption } from './duration.ts';

test.each([
  ['milliseconds', 1500],
  ['a string', '1.5 seconds'],
  ['a Duration', Duration.millis(1500)],
] as const)('a timer option in %s decodes to a Duration', (_, input) => {
  expect(Duration.toMillis(timerOption(input, false)!)).toBe(1500);
});

test('false turns a timer off, and a missing option takes the fallback', () => {
  expect(timerOption(false, '1 second')).toBeUndefined();
  expect(timerOption(undefined, false)).toBeUndefined();
  expect(Duration.toMillis(timerOption(undefined, '15 seconds')!)).toBe(15_000);
});

test('input Duration cannot decode throws where the option is read', () => {
  expect(() => timerOption('soon' as never, false)).toThrow(
    'Invalid Input: soon',
  );
});
