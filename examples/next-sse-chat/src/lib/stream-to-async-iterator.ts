export function streamToAsyncIterable<TValue>(
  stream: ReadableStream<TValue>,
  opts?: {
    signal?: AbortSignal;
  },
): AsyncIterable<TValue> {
  const signal = opts?.signal;

  if (signal?.aborted) {
    const iterator: AsyncIterator<TValue> = {
      next: async () => ({
        value: undefined,
        done: true,
      }),
    };
    return {
      [Symbol.asyncIterator]: () => iterator,
    };
  }
  const reader = stream.getReader();

  if (signal) {
    signal.addEventListener(
      'abort',
      () => {
        reader.cancel().catch(() => {
          // noop
        });
      },
      { once: true },
    );
  }

  const iterator: AsyncIterator<TValue> = {
    async next() {
      const value = await reader.read();
      if (value.done) {
        return {
          value: undefined,
          done: true,
        };
      }
      return {
        value: value.value,
        done: false,
      };
    },
    async return() {
      await reader.cancel();
      return {
        value: undefined,
        done: true,
      };
    },
  };

  return {
    [Symbol.asyncIterator]: () => iterator,
  };
}
