import { makeResource } from '../stream/utils/disposable';

/**
 * Named timers for a state machine. `onFire` gets a timer's name when it goes
 * off, straight from its timeout, so one that was cancelled or restarted
 * never fires. Disposing it clears every timer.
 * @example
 * ```ts
 * const timers = runtime.use(
 *   createMachineTimers<'backoff'>((timer) =>
 *     runtime.send({ type: 'timer', timer }),
 *   ),
 * );
 * timers.start('backoff', 1_000);
 * ```
 */
export function createMachineTimers<TTimer>(onFire: (timer: TTimer) => void) {
  const running = new Map<TTimer, ReturnType<typeof setTimeout>>();
  let disposed = false;

  function cancel(timer: TTimer) {
    const timeout = running.get(timer);
    if (timeout === undefined) return;
    running.delete(timer);
    clearTimeout(timeout);
  }

  return makeResource(
    {
      /** Starts `timer`, or restarts it if it's running. Ignored once disposed. */
      start(timer: TTimer, ms: number) {
        if (disposed) return;
        cancel(timer);
        running.set(
          timer,
          setTimeout(() => {
            running.delete(timer);
            onFire(timer);
          }, ms),
        );
      },
      cancel,
    },
    () => {
      disposed = true;
      for (const timer of [...running.keys()]) cancel(timer);
    },
  );
}
export type MachineTimers<TTimer> = ReturnType<
  typeof createMachineTimers<TTimer>
>;
