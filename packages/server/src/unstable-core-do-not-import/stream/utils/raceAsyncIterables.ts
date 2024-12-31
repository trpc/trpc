import { createDeferred } from './createDeferred';
import { makeAsyncResource } from './disposable';

type ActiveStatePending = 0 & { _brand: 'Pending' };
const ActiveStatePending = 0 as ActiveStatePending;
type ActiveStateIdle = 1 & { _brand: 'Idle' };
const ActiveStateIdle = 1 as ActiveStateIdle;
type State = ActiveStatePending | ActiveStateIdle;

/**
 * Merges multiple async iterables into a single async iterable that yields values in the order they resolve
 */
export function raceAsyncIterables<T>(): AsyncIterable<T, void, unknown> & {
  add(iterable: AsyncIterable<T, void, unknown>): void;
} {
  const pendingIterables: AsyncIterable<T, void, unknown>[] = [];

  const activeIterators = new Map<AsyncIterator<T, void, unknown>, State>();
  let running = false;
  let frozen = false;
  const buffer: Array<
    | [AsyncIterator<T, void, unknown>, 0, T]
    | [AsyncIterator<T, void, unknown>, 1, unknown]
  > = [];

  let drain = createDeferred<void>();

  function iterate(iterator: AsyncIterator<T>) {
    const next = iterator.next();
    activeIterators.set(iterator, ActiveStatePending);

    next
      .then((result) => {
        if (result.done) {
          activeIterators.delete(iterator);
        } else {
          buffer.push([iterator, 0, result.value]);
          activeIterators.set(iterator, ActiveStateIdle);
        }
      })
      .catch((cause) => {
        buffer.push([iterator, 1, cause]);
        activeIterators.delete(iterator);
      })
      .finally(() => {
        drain.resolve();
      });
  }

  return {
    add(iterable: AsyncIterable<T, void, unknown>) {
      if (frozen) {
        throw new Error('Cannot add iterable after iteration ended');
      }
      if (!running) {
        pendingIterables.push(iterable);
        return;
      }
      const iterator = iterable[Symbol.asyncIterator]();
      iterate(iterator);
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
      });

      let iterable;
      while ((iterable = pendingIterables.shift())) {
        const iterator = iterable[Symbol.asyncIterator]();
        iterate(iterator);
      }

      while (activeIterators.size > 0) {
        await drain.promise;

        let chunk;
        while ((chunk = buffer.shift())) {
          const [iterator, status, value] = chunk;

          switch (status) {
            case 0:
              yield value;
              if (activeIterators.get(iterator) === ActiveStateIdle) {
                iterate(iterator);
              }
              break;
            case 1:
              throw value;
          }
        }
        drain = createDeferred();
      }
    },
  };
}
