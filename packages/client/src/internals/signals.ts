import type { Maybe } from '@trpc/server/unstable-core-do-not-import';

/**
 * Like `Promise.all()` but for abort signals
 * - When all signals have been aborted, the merged signal will be aborted
 * - If one signal is `null`, no signal will be aborted
 */
export function allAbortSignals(...signals: Maybe<AbortSignal>[]): AbortSignal {
  const ac = new AbortController();

  const count = signals.length;

  let abortedCount = 0;

  const onAbort = () => {
    if (++abortedCount === count) {
      ac.abort();
    }
  };

  for (const signal of signals) {
    if (signal?.aborted) {
      onAbort();
    } else {
      signal?.addEventListener('abort', onAbort, {
        once: true,
      });
    }
  }

  return ac.signal;
}

/**
 * Like `Promise.race` but for abort signals
 */
export function raceAbortSignals(
  ...signals: Maybe<AbortSignal>[]
): AbortSignal {
  const ac = new AbortController();

  for (const signal of signals) {
    if (signal?.aborted) {
      ac.abort();
    } else {
      signal?.addEventListener('abort', () => ac.abort(), { once: true });
    }
  }

  return ac.signal;
}
