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
 *
 * Basically, a ponyfill for
 * [`AbortSignal.any`](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/any_static).
 */
export function raceAbortSignals(
  ...signals: Maybe<AbortSignal>[]
): AbortSignal {
  return raceAbortSignalsWithCleanup(...signals).signal;
}

// Completion can release input listeners without aborting a consumed response.
export function raceAbortSignalsWithCleanup(...signals: Maybe<AbortSignal>[]) {
  const ac = new AbortController();
  const cleanup = () => {
    for (const signal of signals) {
      signal?.removeEventListener('abort', onAbort);
    }
  };
  const onAbort = () => {
    cleanup();
    ac.abort();
  };

  for (const signal of signals) {
    if (signal?.aborted) {
      onAbort();
      break;
    }
    signal?.addEventListener('abort', onAbort, { once: true });
  }

  return { signal: ac.signal, cleanup };
}

export function abortSignalToPromise(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    signal.addEventListener(
      'abort',
      () => {
        reject(signal.reason);
      },
      { once: true },
    );
  });
}
