import { observable, observableToAsyncIterable } from '@trpc/server/observable';
import type { Timer } from './machine/clientMachine';
import { dispose, timeoutResource } from './scope';

/** A timer went off. `start` tells it from a later start of the same timer. */
export interface TimerFired {
  readonly type: 'timerFired';
  readonly timer: Timer;
  readonly start: number;
}

export interface Timers {
  /** Every timer that goes off, for one consumer. */
  readonly events: AsyncIterable<TimerFired>;
  /** Starts `timer`, or restarts it if it's running. */
  start(timer: Timer, ms: number): void;
  cancel(timer: Timer): void;
  /**
   * Whether `fired` still counts, and if so forgets the timer: one that was
   * cancelled or restarted after it went off doesn't.
   */
  take(fired: TimerFired): boolean;
}

const neverAborted = new AbortController().signal;

/** The client's timers, as one stream of the times they go off. */
export function createTimers(): Timers {
  const running = new Map<Timer, { start: number; timeout: Disposable }>();
  let starts = 0;
  let fire: (fired: TimerFired) => void = () => {
    // not listened to
  };

  const events = observableToAsyncIterable(
    observable<TimerFired, never>((emit) => {
      fire = (fired) => emit.next(fired);
      return () => {
        for (const timer of [...running.keys()]) cancel(timer);
      };
    }),
    neverAborted,
  );

  function cancel(timer: Timer) {
    const current = running.get(timer);
    if (!current) return;
    running.delete(timer);
    dispose(current.timeout);
  }

  return {
    events,
    start(timer, ms) {
      cancel(timer);
      const start = ++starts;
      running.set(timer, {
        start,
        timeout: timeoutResource(
          () => fire({ type: 'timerFired', timer, start }),
          ms,
        ),
      });
    },
    cancel,
    take(fired) {
      if (running.get(fired.timer)?.start !== fired.start) return false;
      running.delete(fired.timer);
      return true;
    },
  };
}
