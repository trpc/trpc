import { Unpromise } from '../../../vendor/unpromise';
import { disposablePromiseTimer } from './promiseTimer';

/**
 * Derives a new {@link AsyncGenerator} based of {@link iterable}, that automatically stops with the
 * passed {@link cancel} promise.
 */
export async function* withCancel<T>(
  iterable: AsyncIterable<T>,
  cancel: Promise<unknown>,
): AsyncGenerator<T> {
  const cancelPromise = cancel.then((() => null));
  const iterator = iterable[Symbol.asyncIterator]();
  // declaration outside the loop for garbage collection reasons
  let result: Awaited<typeof cancelPromise> | IteratorResult<T>;
  while (true) {
    result = await Unpromise.race([iterator.next(), cancelPromise]);
    if (result == null) {
      await iterator.return?.();
      break;
    }
    if (result.done) {
      break;
    }
    yield result.value;
    // free up reference for garbage collection
    result = null;
  }
}

/**
 * Derives a new {@link AsyncGenerator} based on {@link iterable}, that automatically stops after the specified duration.
 */
export async function* withMaxDuration<T>(
  iterable: AsyncIterable<T>,
  opts: { maxDurationMs: number; abortCtrl: AbortController }
): AsyncGenerator<T> {
  const iterator = iterable[Symbol.asyncIterator]();
  
  using timer = disposablePromiseTimer(opts.maxDurationMs);
  const timerPromise = timer.start().then(() => null)

  // declaration outside the loop for garbage collection reasons
  let result: IteratorResult<T> | Awaited<typeof timerPromise>;

  while (true) {
    result = await Unpromise.race([iterator.next(), timerPromise]);
    if (result == null) {
      // cancelled due to timeout
      opts.abortCtrl.abort();
      await iterator.return?.();
      break;
    }
    if (result.done) {
      break;
    }
    yield result.value;
    // free up reference for garbage collection
    result = null;
  }
}


interface TakeWithGraceOptions {
  count: number;
  gracePeriodMs: number;
  onCancel: () => void;
}

/**
 * Derives a new {@link AsyncGenerator} based of {@link iterable}, that yields its first
 * {@link count} values. Then, a grace period of {@link gracePeriodMs} is started in which further
 * values may still come through. After this period, the generator stops.
 */
export async function* takeWithGrace<T>(
  iterable: AsyncIterable<T>,
  { count, gracePeriodMs, onCancel }: TakeWithGraceOptions,
): AsyncGenerator<T> {
  const iterator = iterable[Symbol.asyncIterator]();

  // declaration outside the loop for garbage collection reasons
  let result: null | IteratorResult<T> | void;
  
  using timer = disposablePromiseTimer(gracePeriodMs);

  let timerPromise = new Promise<void>(() => {
    // never resolves
  });
  while (true) {
    result = await Unpromise.race([iterator.next(), timerPromise]);
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
      timerPromise = timer.start()
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      timerPromise.then(() => onCancel())
    }
    // free up reference for garbage collection
    result = null;
  }
}
