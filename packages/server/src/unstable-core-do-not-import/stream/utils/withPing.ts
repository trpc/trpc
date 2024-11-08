import { Unpromise } from '../../../vendor/unpromise';
import { disposablePromiseTimer } from './promiseTimer';

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
  const iterator = iterable[Symbol.asyncIterator]();
  // declaration outside the loop for garbage collection reasons
  let result: null | IteratorResult<TValue | typeof PING_SYM>;
  
  let nextPromise = iterator.next();
  while (true) {
    using pingPromise = disposablePromiseTimer(pingIntervalMs)
    
    result = await Unpromise.race([
      nextPromise, 
      pingPromise.start().then(() => {
        return PING_RESULT;
      }),
    ]);
    
    if (result !== PING_RESULT) {
      nextPromise = iterator.next();
    }
    if (result.done) {
      return result.value;
    }
    yield result.value;
    
    // free up reference for garbage collection
    result = null;
  }
}
