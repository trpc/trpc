import { createDeferred } from './createDeferred';
import { makeAsyncResource } from './disposable';

type Brand<T, TKey> = T & { _brand: TKey };

type ActiveStatePending = Brand<0, 'Pending'>;
const ActiveStatePending = 0 as ActiveStatePending;
type ActiveStateIdle = Brand<1, 'Idle'>;
const ActiveStateIdle = 1 as ActiveStateIdle;
type State = ActiveStatePending | ActiveStateIdle;

type ResultTuple<T> =
  | [status: 0, value: T]
  | [status: 1, cause: unknown]
  | [status: 2, done: true];

function createIterator<T>(
  iterable: AsyncIterable<T>,
  callback: (result: ResultTuple<T>) => void,
) {
  const iterator = iterable[Symbol.asyncIterator]();
  let activeState: State = ActiveStateIdle;

  function unlink() {
    callback = () => {
      // noop
    };
  }

  function pull() {
    if (activeState !== ActiveStateIdle) {
      throw new Error('Iterator is not idle');
    }
    activeState = ActiveStatePending;

    const next = iterator.next();
    next
      .then((result) => {
        activeState = ActiveStateIdle;
        if (result.done) {
          callback([2, true]);
          unlink();
        } else {
          callback([0, result.value]);
        }
      })
      .catch((cause) => {
        activeState = ActiveStateIdle;
        callback([1, cause]);
        unlink();
      });
  }
  pull();

  return {
    pull,
    destroy: async () => {
      unlink();
      await iterator.return?.();
    },
  };
}
type RacedIterator<T> = ReturnType<typeof createIterator<T>>;

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

  const activeIterators = new Set<ReturnType<typeof createIterator<TYield>>>();
  let running = false;
  let frozen = false;
  const buffer: Array<
    [iterator: RacedIterator<TYield>, result: ResultTuple<TYield>]
  > = [];

  let flush = createDeferred<void>();

  function initIterable(iterable: AsyncIterable<TYield, void, unknown>) {
    const iterator = createIterator(iterable, (result) => {
      const [status] = result;

      switch (status) {
        case 0:
          buffer.push([iterator, result]);
          break;
        case 1:
          buffer.push([iterator, result]);
          activeIterators.delete(iterator);
          break;
        case 2:
          activeIterators.delete(iterator);
          break;
      }
      flush.resolve();
    });
    activeIterators.add(iterator);
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
      initIterable(iterable);
    },

    async *[Symbol.asyncIterator]() {
      if (frozen || running) {
        throw new Error('Cannot iterate twice');
      }
      running = true;

      await using _finally = makeAsyncResource({}, async () => {
        frozen = true;
        flush.resolve();
        await Promise.all(
          Array.from(activeIterators.values()).map((it) => it.destroy()),
        );
        activeIterators.clear();
        buffer.length = 0;
        running = false;
      });

      let iterable;
      while ((iterable = pendingIterables.shift())) {
        initIterable(iterable);
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
              iterator.pull();
              break;
            case 1:
              throw value;
            case 2:
              // ignore
              break;
          }
        }
        flush = createDeferred();
      }
    },
  };
}
