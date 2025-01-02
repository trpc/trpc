import { createDeferred } from './createDeferred';
import { makeAsyncResource } from './disposable';

type Brand<T, TKey> = T & { _brand: TKey };

type ActiveStatePending = Brand<0, 'Pending'>;
const ActiveStatePending = 0 as ActiveStatePending;
type ActiveStateIdle = Brand<1, 'Idle'>;
const ActiveStateIdle = 1 as ActiveStateIdle;
type State = ActiveStatePending | ActiveStateIdle;

type ResultTuple<T> = [status: 0, value: T] | [status: 1, cause: unknown];

/**
 * Creates a new async iterable that merges multiple async iterables into a single stream.
 * Values from the input iterables are yielded in the order they resolve, similar to Promise.race().
 *
 * New iterables can be added dynamically using the returned `add()` method, even after iteration has started.
 *
 * If any of the input iterables throws an error, that error will be propagated through the merged stream.
 * Other iterables will not continue to be processed.
 *
 * @template TYield The type of values yielded by the input iterables
 */
export function raceAsyncIterables<TYield>(): AsyncIterable<
  TYield,
  void,
  unknown
> & {
  add(iterable: AsyncIterable<TYield, void, unknown>): void;
} {
  const pendingIterables: AsyncIterable<TYield, void, unknown>[] = [];

  const activeIterators = new Map<
    AsyncIterator<TYield, void, unknown>,
    State
  >();
  let running = false;
  let frozen = false;
  const buffer: Array<
    [
      iterator: AsyncIterator<TYield, void, unknown>,
      result: ResultTuple<TYield>,
    ]
  > = [];

  let flush = createDeferred<void>();

  function pull(iterator: AsyncIterator<TYield>) {
    const next = iterator.next();
    activeIterators.set(iterator, ActiveStatePending);

    next
      .then((result) => {
        if (result.done) {
          activeIterators.delete(iterator);
        } else {
          buffer.push([iterator, [0, result.value]]);
          activeIterators.set(iterator, ActiveStateIdle);
        }
      })
      .catch((cause) => {
        buffer.push([iterator, [1, cause]]);
        activeIterators.delete(iterator);
      })
      .finally(() => {
        flush.resolve();
      });
  }

  return {
    add(iterable: AsyncIterable<TYield, void, unknown>) {
      if (frozen) {
        throw new Error('Cannot add iterable after iteration ended');
      }
      if (!running) {
        pendingIterables.push(iterable);
        return;
      }
      const iterator = iterable[Symbol.asyncIterator]();
      pull(iterator);
    },

    async *[Symbol.asyncIterator]() {
      if (frozen || running) {
        throw new Error('Cannot iterate twice');
      }
      running = true;

      await using _finally = makeAsyncResource({}, async () => {
        frozen = true;
        await Promise.all(
          Array.from(activeIterators.keys()).map((it) => it.return?.()),
        );
        activeIterators.clear();
        buffer.length = 0;
        running = false;
        flush.resolve();
      });

      let iterable;
      while ((iterable = pendingIterables.shift())) {
        const iterator = iterable[Symbol.asyncIterator]();
        pull(iterator);
      }

      while (activeIterators.size > 0) {
        await flush.promise;

        let chunk;
        while ((chunk = buffer.shift())) {
          const [iterator, result] = chunk;
          const [status, value] = result;

          switch (status) {
            case 0:
              yield value;
              if (activeIterators.get(iterator) === ActiveStateIdle) {
                pull(iterator);
              }
              break;
            case 1:
              throw value;
          }
        }
        flush = createDeferred();
      }
    },
  };
}
