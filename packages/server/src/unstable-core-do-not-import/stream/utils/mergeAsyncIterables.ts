import { createDeferred } from './createDeferred';
import { makeAsyncResource } from './disposable';

type ManagedIteratorResult<TYield, TReturn> =
  | { status: 'yield'; value: TYield }
  | { status: 'return'; value: TReturn }
  | { status: 'error'; error: unknown };
function createManagedIterator<TYield, TReturn>(
  iterable: AsyncIterable<TYield, TReturn>,
  onResult: (result: ManagedIteratorResult<TYield, TReturn>) => void,
) {
  const iterator = iterable[Symbol.asyncIterator]();
  let state: 'idle' | 'pending' | 'done' = 'idle';

  function cleanup() {
    state = 'done';
    onResult = () => {
      // noop
    };
  }

  function pull() {
    if (state !== 'idle') {
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

interface MergedAsyncIterables<TYield>
  extends AsyncIterable<TYield, void, unknown> {
  add(iterable: AsyncIterable<TYield>): void;
}

/**
 * Creates a new async iterable that merges multiple async iterables into a single stream.
 * Values from the input iterables are yielded in the order they resolve, similar to Promise.race().
 *
 * New iterables can be added dynamically using the returned {@link MergedAsyncIterables.add} method, even after iteration has started.
 *
 * If any of the input iterables throws an error, that error will be propagated through the merged stream.
 * Other iterables will not continue to be processed.
 *
 * @template TYield The type of values yielded by the input iterables
 */
export function mergeAsyncIterables<TYield>(): MergedAsyncIterables<TYield> {
  let state: 'idle' | 'pending' | 'done' = 'idle';
  let flushSignal = createDeferred();

  /**
   * used while {@link state} is `idle`
   */
  const iterables: AsyncIterable<TYield, void, unknown>[] = [];
  /**
   * used while {@link state} is `pending`
   */
  const iterators = new Set<ManagedIterator<TYield, void>>();

  const buffer: Array<
    [
      iterator: ManagedIterator<TYield, void>,
      result: Exclude<
        ManagedIteratorResult<TYield, void>,
        { status: 'return' }
      >,
    ]
  > = [];

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
          iterators.delete(iterator);
          break;
        case 'error':
          buffer.push([iterator, result]);
          iterators.delete(iterator);
          break;
      }
      flushSignal.resolve();
    });
    iterators.add(iterator);
    iterator.pull();
  }

  return {
    add(iterable: AsyncIterable<TYield, void, unknown>) {
      switch (state) {
        case 'idle':
          iterables.push(iterable);
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

        const errors: unknown[] = [];
        await Promise.all(
          Array.from(iterators.values()).map(async (it) => {
            try {
              await it.destroy();
            } catch (cause) {
              errors.push(cause);
            }
          }),
        );
        buffer.length = 0;
        iterators.clear();
        flushSignal.resolve();

        if (errors.length > 0) {
          throw new AggregateError(errors);
        }
      });

      while (iterables.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        initIterable(iterables.shift()!);
      }

      while (iterators.size > 0) {
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
