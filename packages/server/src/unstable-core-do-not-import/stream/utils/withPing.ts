import { Unpromise } from '../../../vendor/unpromise';
import { createPromiseTimer } from './promiseTimer';

export const PING_SYM = Symbol('ping');

const PING_RESULT: IteratorResult<typeof PING_SYM> = {
  value: PING_SYM,
  done: false,
};

/**
 * Derives a new {@link AsyncGenerator} based of {@link iterable}, that yields {@link PING_SYM}
 * whenever no value has been yielded for {@link pingIntervalMs}.
 */
export async function* withPing<TValue>(
  iterable: AsyncIterable<TValue>,
  pingIntervalMs: number,
): AsyncGenerator<TValue | typeof PING_SYM> {
  const timer = createPromiseTimer(pingIntervalMs);
  const iterator = iterable[Symbol.asyncIterator]();
  // declaration outside the loop for garbage collection reasons
  let result: null | IteratorResult<TValue | typeof PING_SYM>;
  while (true) {
    const nextPromise = iterator.next();
    const pingPromise = timer.start().promise.then(() => PING_RESULT);
    try {
      result = await Unpromise.race([nextPromise, pingPromise]);
    } finally {
      timer.clear();
    }
    if (result.done) {
      return result.value;
    }
    yield result.value;
    timer.reset();
    // free up reference for garbage collection
    result = null;
  }
}
