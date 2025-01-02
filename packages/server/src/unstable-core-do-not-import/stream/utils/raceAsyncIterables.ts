import { createDeferred } from './createDeferred';
import { makeAsyncResource } from './disposable';

type IteratorRaceResult<TYield, TReturn> =
  | { status: 'yield'; value: TYield }
  | { status: 'return'; value: TReturn }
  | { status: 'error'; error: unknown };

function createManagedIterator<TYield, TReturn>(
  iterable: AsyncIterable<TYield, TReturn>,
  onResult: (result: IteratorRaceResult<TYield, TReturn>) => void,
) {
  const iterator = iterable[Symbol.asyncIterator]();
  let state: 'idle' | 'pending' | 'done' = 'idle';

  function cleanup() {
    onResult = () => {
      // noop
    };
  }

  function pull() {
    if (state !== 'idle') {
      // Already pulling
      return;
    }
    state = 'pending';

    const next = iterator.next();
    next
      .then((result) => {
        if (result.done) {
          state = 'done';
          onResult({ status: 'return', value: result.value });
          cleanup();
          return;
        }
        state = 'idle';
        onResult({ status: 'yield', value: result.value });
      })
      .catch((cause) => {
        state = 'done';
        onResult({ status: 'error', error: cause });
        cleanup();
      });
  }

  return {
    pull,
    destroy: async () => {
      cleanup();
      await iterator.return?.();
    },
  };
}
type ManagedIterator<TYield, TReturn> = ReturnType<
  typeof createManagedIterator<TYield, TReturn>
>;

interface RaceAsyncIterables<TYield> extends AsyncIterable<TYield> {
  add(iterable: AsyncIterable<TYield>): void;
}

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
export function raceAsyncIterables<TYield>(): RaceAsyncIterables<TYield> {
  const pendingIterables: AsyncIterable<TYield, void, unknown>[] = [];
  const activeIterators = new Set<ManagedIterator<TYield, void>>();
  const buffer: Array<
    [
      iterator: ManagedIterator<TYield, void>,
      result: Exclude<IteratorRaceResult<TYield, void>, { status: 'return' }>,
    ]
  > = [];

  let state: 'idle' | 'pending' | 'done' = 'idle';
  let flushSignal = createDeferred<void>();

  function initIterable(iterable: AsyncIterable<TYield, void, unknown>) {
    if (state !== 'pending') {
      // shouldn't happen
      return;
    }
    const iterator = createManagedIterator(iterable, (result) => {
      if (state !== 'pending') {
        // shouldn't happen
        return;
      }
      switch (result.status) {
        case 'yield':
          buffer.push([iterator, result]);
          break;
        case 'return':
          activeIterators.delete(iterator);
          break;
        case 'error':
          buffer.push([iterator, result]);
          activeIterators.delete(iterator);
          break;
      }
      flushSignal.resolve();
    });
    activeIterators.add(iterator);
    iterator.pull();
  }

  return {
    add(iterable: AsyncIterable<TYield, void, unknown>) {
      switch (state) {
        case 'idle':
          pendingIterables.push(iterable);
          break;
        case 'pending':
          initIterable(iterable);
          break;
        case 'done': {
          // shouldn't happen
          break;
        }
      }
    },
    async *[Symbol.asyncIterator]() {
      if (state !== 'idle') {
        throw new Error('Cannot iterate twice');
      }
      state = 'pending';

      await using _finally = makeAsyncResource({}, async () => {
        state = 'done';

        const results = await Promise.allSettled(
          Array.from(activeIterators.values()).map((it) => it.destroy()),
        );
        buffer.length = 0;
        activeIterators.clear();
        flushSignal.resolve();

        const errors = results
          .filter((r) => r.status === 'rejected')
          .map((r) => r.reason);
        if (errors.length > 0) {
          throw new AggregateError(
            errors,
            'Errors during cleanup of iterators',
          );
        }
      });

      while (pendingIterables.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        initIterable(pendingIterables.shift()!);
      }

      while (activeIterators.size > 0) {
        await flushSignal.promise;

        while (buffer.length > 0) {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          const [iterator, result] = buffer.shift()!;

          switch (result.status) {
            case 'yield':
              yield result.value;
              iterator.pull();
              break;
            case 'error':
              throw result.error;
          }
        }
        flushSignal = createDeferred();
      }
    },
  };
}
