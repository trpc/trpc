import { makeResource } from '../unstable-core-do-not-import';

export function fakeTimersResource() {
  vi.useFakeTimers();

  return makeResource(
    {
      advanceTimersByTimeAsync: vi.advanceTimersByTimeAsync,
      runAllTimersAsync: vi.runAllTimersAsync,
    },
    () => {
      vi.useRealTimers();
    },
  );
}
