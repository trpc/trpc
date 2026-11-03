import type { Unsubscribable } from '@trpc/server/observable';

/**
 * What `subscribe()` returns. Call `unsubscribe()` to stop it, or iterate
 * it with `for await`. Each iterator yields the data that arrives after it
 * was created; leaving the loop early unsubscribes.
 * @see https://trpc.io/docs/client/vanilla/setup#5-use-subscriptions
 */
export interface TRPCSubscription<TValue>
  extends Unsubscribable, AsyncIterable<TValue> {}

type Ending = { ok: true } | { ok: false; error: unknown };

interface IteratorSink<TValue> {
  push(value: TValue): void;
  end(ending: Ending): void;
}

/**
 * Fans a subscription's data and ending out to its async iterators.
 * Nothing is buffered until an iterator is created, so callback-only
 * subscriptions hold no data.
 * @internal
 */
export function createIterableSubscription<TValue>(opts: {
  signal: AbortSignal | undefined;
}) {
  const sinks = new Set<IteratorSink<TValue>>();
  let ending: Ending | null = null;

  function createIterator(unsubscribe: () => void): AsyncIterator<TValue> {
    const buffer: TValue[] = [];
    let iteratorEnding: Ending | null = ending;
    let pending: {
      resolve: (result: IteratorResult<TValue>) => void;
      reject: (error: unknown) => void;
    } | null = null;

    const onAbort = () => sink.end({ ok: true });

    function detach() {
      sinks.delete(sink);
      opts.signal?.removeEventListener('abort', onAbort);
    }

    const sink: IteratorSink<TValue> = {
      push(value) {
        if (pending) {
          const { resolve } = pending;
          pending = null;
          resolve({ value, done: false });
          return;
        }
        buffer.push(value);
      },
      end(nextEnding) {
        if (iteratorEnding) {
          return;
        }
        iteratorEnding = nextEnding;
        detach();
        if (pending) {
          const { resolve, reject } = pending;
          pending = null;
          iteratorEnding = { ok: true };
          if (nextEnding.ok) {
            resolve({ value: undefined, done: true });
          } else {
            reject(nextEnding.error);
          }
        }
      },
    };

    if (!iteratorEnding) {
      if (opts.signal?.aborted) {
        iteratorEnding = { ok: true };
      } else {
        sinks.add(sink);
        opts.signal?.addEventListener('abort', onAbort, { once: true });
      }
    }

    return {
      async next() {
        if (buffer.length > 0) {
          return { value: buffer.shift() as TValue, done: false };
        }
        if (iteratorEnding) {
          const current = iteratorEnding;
          // an error is thrown once, then the iterator is done
          iteratorEnding = { ok: true };
          if (!current.ok) {
            throw current.error;
          }
          return { value: undefined, done: true };
        }
        return new Promise<IteratorResult<TValue>>((resolve, reject) => {
          pending = { resolve, reject };
        });
      },
      async return() {
        buffer.length = 0;
        sink.end({ ok: true });
        unsubscribe();
        return { value: undefined, done: true };
      },
    };
  }

  return {
    push(value: TValue) {
      for (const sink of sinks) {
        sink.push(value);
      }
    },
    end(nextEnding: Ending) {
      if (ending) {
        return;
      }
      ending = nextEnding;
      for (const sink of [...sinks]) {
        sink.end(nextEnding);
      }
    },
    createIterator,
  };
}
