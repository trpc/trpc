import { Unpromise } from '../../../vendor/unpromise';
import { makeAsyncResource } from './disposable';
import { disposablePromiseTimerResult, timerResource } from './timerResource';

export function iteratorResource<TYield, TReturn, TNext>(
  iterable: AsyncIterable<TYield, TReturn, TNext>,
): AsyncIterator<TYield, TReturn, TNext> & AsyncDisposable {
  const iterator = iterable[Symbol.asyncIterator]();

  return makeAsyncResource(iterator, async () => {
    await iterator.return?.();
  });
}
/**
 * Derives a new {@link AsyncGenerator} based on {@link iterable}, that automatically stops after the specified duration.
 */
export async function* withMaxDuration<T>(
  iterable: AsyncIterable<T>,
  opts: { maxDurationMs: number },
): AsyncGenerator<T> {
  await using iterator = iteratorResource(iterable);

  using timer = timerResource(opts.maxDurationMs);

  const timerPromise = timer.start();

  // declaration outside the loop for garbage collection reasons
  let result: null | IteratorResult<T> | typeof disposablePromiseTimerResult;

  while (true) {
    result = await Unpromise.race([iterator.next(), timerPromise]);
    if (result === disposablePromiseTimerResult) {
      // cancelled due to timeout

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
  },
): AsyncGenerator<T> {
  await using iterator = iteratorResource(iterable);

  // declaration outside the loop for garbage collection reasons
  let result: null | IteratorResult<T> | typeof disposablePromiseTimerResult;

  using timer = timerResource(opts.gracePeriodMs);

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
    }
    // free up reference for garbage collection
    result = null;
  }
}
