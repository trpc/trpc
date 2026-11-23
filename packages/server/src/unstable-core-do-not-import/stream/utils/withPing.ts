import { Unpromise } from '../../../vendor/unpromise';
import { iteratorResource } from './asyncIterable';
import { disposablePromiseTimerResult, timerResource } from './timerResource';

export const PING_SYM = Symbol('ping');

/**
 * Derives a new {@link AsyncGenerator} based of {@link iterable}, that yields {@link PING_SYM}
 * whenever no value has been yielded for {@link pingIntervalMs}.
 */
export async function* withPing<TValue>(
  iterable: AsyncIterable<TValue>,
  pingIntervalMs: number,
): AsyncGenerator<TValue | typeof PING_SYM> {
  await using iterator = iteratorResource(iterable);

  // declaration outside the loop for garbage collection reasons
  let result:
    | null
    | IteratorResult<TValue>
    | typeof disposablePromiseTimerResult;

  let nextPromise = iterator.next();

  while (true) {
    using pingPromise = timerResource(pingIntervalMs);

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
