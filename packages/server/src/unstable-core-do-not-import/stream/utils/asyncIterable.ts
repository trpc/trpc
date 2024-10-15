import { noop } from '../../utils';
import { createPromiseTimer } from './promiseTimer';

/**
 * Derives a new {@link AsyncGenerator} based of {@link iterable}, that automatically stops with the
 * passed {@link cancel} promise.
 */
export async function* withCancel<T>(
  iterable: AsyncIterable<T>,
  cancel: Promise<unknown>,
): AsyncGenerator<T> {
  const cancelPromise = cancel.then(noop);
  const iterator = iterable[Symbol.asyncIterator]();
  while (true) {
    const result = await Promise.race([iterator.next(), cancelPromise]);
    if (result == null) {
      await iterator.return?.();
      break;
    }
    if (result.done) {
      break;
    }
    yield result.value;
  }
}

interface TakeWithGraceOptions {
  count: number;
  gracePeriodMs: number;
}

/**
 * Derives a new {@link AsyncGenerator} based of {@link iterable}, that yields its first
 * {@link count} values. Then, a grace period of {@link gracePeriodMs} is started in which further
 * values may still come through. After this period, the generator stops.
 */
export async function* takeWithGrace<T>(
  iterable: AsyncIterable<T>,
  { count, gracePeriodMs }: TakeWithGraceOptions,
): AsyncGenerator<T> {
  const iterator = iterable[Symbol.asyncIterator]();
  const timer = createPromiseTimer(gracePeriodMs);
  try {
    while (true) {
      const result = await Promise.race([iterator.next(), timer.promise]);
      if (result == null) {
        // cancelled
        await iterator.return?.();
        break;
      }
      if (result.done) {
        break;
      }
      yield result.value;
      if (--count === 0) {
        timer.start();
      }
    }
  } finally {
    timer.clear();
  }
}
