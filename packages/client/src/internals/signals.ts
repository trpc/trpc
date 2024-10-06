import type { Maybe } from '@trpc/server/unstable-core-do-not-import/types';

/**
 * Like `Promise.all()` but for abort signals
 * - When all signals have been aborted, the merged signal will be aborted
 * - If one signal is `null`, no signal will be aborted
 */
export function allAbortSignals(
  opts: {
    signal: Maybe<AbortSignal>;
  }[],
): AbortController {
  const ac = new AbortController();

  if (opts.some((o) => !o.signal)) {
    return ac;
  }

  const count = opts.length;

  let abortedCount = 0;

  const onAbort = () => {
    if (++abortedCount === count) {
      ac.abort();
    }
  };

  for (const o of opts) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const signal = o.signal!;
    if (signal.aborted) {
      onAbort();
    } else {
      signal.addEventListener('abort', onAbort, {
        once: true,
      });
    }
  }

  return ac;
}

/**
 * Like `Promise.race` but for abort signals
 */
export function raceAbortSignals(
  ...signals: Maybe<AbortSignal>[]
): AbortSignal {
  const ac = new AbortController();

  for (const signal of signals.filter((it) => !!it)) {
    signal.addEventListener('abort', () => ac.abort(), { once: true });
    if (signal.aborted) {
      ac.abort();
    }
  }

  return ac.signal;
}
