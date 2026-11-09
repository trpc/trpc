import { Duration } from 'effect';

/**
 * Decodes a timer option once, where it's read: `false` turns the timer
 * off (`undefined`), a missing option takes `fallback`. Throws on input
 * `Duration` can't decode, so a typo fails when the handler is made.
 * @internal
 */
export const timerOption = (
  input: Duration.Input | false | undefined,
  fallback: Duration.Input | false,
): Duration.Duration | undefined => {
  const option = input ?? fallback;
  return option === false ? undefined : Duration.fromInputUnsafe(option);
};
