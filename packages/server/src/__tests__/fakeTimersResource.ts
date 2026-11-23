import { makeResource } from '../unstable-core-do-not-import';

/** The fake timer controls a test drives through its resource, not `vi`. */
type FakeTimerControls = Pick<
  typeof vi,
  | 'advanceTimersByTimeAsync'
  | 'advanceTimersToNextTimer'
  | 'getTimerCount'
  | 'runAllTimers'
  | 'runAllTimersAsync'
>;

export function fakeTimersResource(): FakeTimerControls & Disposable {
  // oxlint-disable-next-line trpc/no-direct-fake-timers
  vi.useFakeTimers();

  return makeResource<FakeTimerControls>(
    {
      advanceTimersByTimeAsync: vi.advanceTimersByTimeAsync,
      advanceTimersToNextTimer: vi.advanceTimersToNextTimer,
      getTimerCount: vi.getTimerCount,
      runAllTimers: vi.runAllTimers,
      runAllTimersAsync: vi.runAllTimersAsync,
    },
    () => {
      // oxlint-disable-next-line trpc/no-direct-fake-timers
      vi.useRealTimers();
    },
  );
}
