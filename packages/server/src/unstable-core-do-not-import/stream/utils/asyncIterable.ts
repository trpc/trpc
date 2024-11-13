import { Unpromise } from '../../../vendor/unpromise';
import {
  disposablePromiseTimer,
  disposablePromiseTimerResult,
} from './disposablePromiseTimer';

/**
 * Derives a new {@link AsyncGenerator} based on {@link iterable}, that automatically stops after the specified duration.
 */
export async function* withMaxDuration<T>(
  iterable: AsyncIterable<T>,
  opts: { maxDurationMs: number; abortCtrl: AbortController },
): AsyncGenerator<T> {
  const iterator = iterable[Symbol.asyncIterator]();

  const timer = disposablePromiseTimer(opts.maxDurationMs);
  try {
    const timerPromise = timer.start();

    // declaration outside the loop for garbage collection reasons
    let result: null | IteratorResult<T> | typeof disposablePromiseTimerResult;

    while (true) {
      result = await Unpromise.race([iterator.next(), timerPromise]);
      if (result === disposablePromiseTimerResult) {
        // cancelled due to timeout
        opts.abortCtrl.abort();
        const res = await iterator.return?.();
        return res?.value;
      }
      if (result.done) {
        return result;
      }
      yield result.value;
      // free up reference for garbage collection
      result = null;
    }
  } finally {
    // dispose timer
    // Shouldn't be needed, but build breaks with `using` keyword
    timer[Symbol.dispose]();
  }
}

/**
 * Derives a new {@link AsyncGenerator} based of {@link iterable}, that yields its first
 * {@link count} values. Then, a grace period of {@link gracePeriodMs} is started in which further
 * values may still come through. After this period, the generator stops.
 */
export async function* takeWithGrace<T>(
  iterable: AsyncIterable<T>,
  opts: {
    count: number;
    gracePeriodMs: number;
    abortCtrl: AbortController;
  },
): AsyncGenerator<T> {
  const iterator = iterable[Symbol.asyncIterator]();

  // declaration outside the loop for garbage collection reasons
  let result: null | IteratorResult<T> | typeof disposablePromiseTimerResult;

  const timer = disposablePromiseTimer(opts.gracePeriodMs);
  try {
    let count = opts.count;

    let timerPromise = new Promise<typeof disposablePromiseTimerResult>(() => {
      // never resolves
    });

    while (true) {
      result = await Unpromise.race([iterator.next(), timerPromise]);
      if (result === disposablePromiseTimerResult) {
        // cancelled
        const res = await iterator.return?.();
        return res?.value;
      }
      if (result.done) {
        return result.value;
      }
      yield result.value;
      if (--count === 0) {
        timerPromise = timer.start();
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        timerPromise.then(() => opts.abortCtrl.abort());
      }
      // free up reference for garbage collection
      result = null;
    }
  } finally {
    timer[Symbol.dispose]();
  }
}
