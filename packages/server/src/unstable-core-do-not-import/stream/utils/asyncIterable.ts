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

  using timer = disposablePromiseTimer(opts.maxDurationMs);

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

  using timer = disposablePromiseTimer(opts.gracePeriodMs);

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
}

export const PING_SYM = Symbol('ping');

/**
 * Derives a new {@link AsyncGenerator} based of {@link iterable}, that yields {@link PING_SYM}
 * whenever no value has been yielded for {@link pingIntervalMs}.
 */
export async function* withPing<TValue>(
  iterable: AsyncIterable<TValue>,
  pingIntervalMs: number,
): AsyncGenerator<TValue | typeof PING_SYM> {
  const iterator = iterable[Symbol.asyncIterator]();
  // declaration outside the loop for garbage collection reasons
  let result:
    | null
    | IteratorResult<TValue>
    | typeof disposablePromiseTimerResult;

  let nextPromise = iterator.next();
  while (true) {
    using pingPromise = disposablePromiseTimer(pingIntervalMs);

    result = await Unpromise.race([nextPromise, pingPromise.start()]);

    if (result === disposablePromiseTimerResult) {
      // cancelled

      yield PING_SYM;
      continue;
    }

    if (result.done) {
      return result.value;
    }

    nextPromise = iterator.next();
    yield result.value;

    // free up reference for garbage collection
    result = null;
  }
}
