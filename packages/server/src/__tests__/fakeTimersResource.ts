import { makeResource } from '../unstable-core-do-not-import';

export function fakeTimersResource() {
  // oxlint-disable-next-line trpc/no-direct-fake-timers
  vi.useFakeTimers();

  return makeResource(
    {
      advanceTimersByTimeAsync: vi.advanceTimersByTimeAsync,
      advanceTimersToNextTimer: vi.advanceTimersToNextTimer,
      getTimerCount: vi.getTimerCount,
      runAllTimersAsync: vi.runAllTimersAsync,
      runAllTimers: vi.runAllTimers,
    },
    () => {
      // oxlint-disable-next-line trpc/no-direct-fake-timers
      vi.useRealTimers();
    },
  );
}
