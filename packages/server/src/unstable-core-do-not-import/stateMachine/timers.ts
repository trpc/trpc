import {
  observable,
  observableToAsyncIterable,
} from '../../observable/observable';
import { makeResource } from '../stream/utils/disposable';

/** A timer went off. `start` tells it apart from a later start of the same timer. */
export interface MachineTimerFired<TTimer> {
  readonly timer: TTimer;
  readonly start: number;
}

/**
 * Named timers for a state machine's runtime, as one async iterable of the
 * times they go off. Feed `events` to `intake` and check `take` in its
 * `receive`: a timer that was cancelled or restarted after it went off, but
 * before its turn, doesn't count. Disposing it clears every timer and ends
 * `events`.
 * @example
 * ```ts
 * const timers = runtime.use(createMachineTimers<'backoff'>());
 * runtime.intake(timers.events, (fired) => {
 *   if (timers.take(fired)) runtime.send({ type: 'timer', timer: fired.timer });
 * });
 * timers.start('backoff', 1_000);
 * ```
 */
export function createMachineTimers<TTimer>() {
  const running = new Map<
    TTimer,
    { start: number; timeout: ReturnType<typeof setTimeout> }
  >();
  const ended = new AbortController();
  let starts = 0;
  let fire: (fired: MachineTimerFired<TTimer>) => void = () => {
    // not read yet
  };

  function cancel(timer: TTimer) {
    const current = running.get(timer);
    if (!current) return;
    running.delete(timer);
    clearTimeout(current.timeout);
  }

  const events = observableToAsyncIterable(
    observable<MachineTimerFired<TTimer>, never>((emit) => {
      fire = (fired) => emit.next(fired);
      return () => {
        for (const timer of [...running.keys()]) cancel(timer);
      };
    }),
    ended.signal,
  );

  return makeResource(
    {
      /** Every timer that goes off, in order, for one reader. */
      events,
      /** Starts `timer`, or restarts it if it's running. */
      start(timer: TTimer, ms: number) {
        cancel(timer);
        const start = ++starts;
        running.set(timer, {
          start,
          timeout: setTimeout(() => fire({ timer, start }), ms),
        });
      },
      cancel,
      /** Whether `fired` still counts; if it does, the timer is done. */
      take(fired: MachineTimerFired<TTimer>) {
        if (running.get(fired.timer)?.start !== fired.start) return false;
        running.delete(fired.timer);
        return true;
      },
    },
    () => ended.abort(),
  );
}
export type MachineTimers<TTimer> = ReturnType<
  typeof createMachineTimers<TTimer>
>;
