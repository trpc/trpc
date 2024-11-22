export type IterableToReadableStreamValue<TYield, TReturn> =
  | {
      type: 'yield';
      value: TYield;
    }
  | {
      type: 'return';
      value: TReturn;
    };
/**
 * Creates a ReadableStream from an AsyncIterable
 * Handles proper cleanup and cancellation of the underlying iterator
 */

export function readableStreamFrom<TYield, TReturn>(
  iterable: AsyncIterable<TYield, TReturn>,
) {
  const iterator = iterable[Symbol.asyncIterator]();

  return new ReadableStream<IterableToReadableStreamValue<TYield, TReturn>>({
    async cancel() {
      try {
        await iterator.return?.();
      } catch {
        // console.error('Error cleaning up iterator:', err);
      }
    },

    async pull(controller) {
      const result = await iterator.next();

      if (result.done) {
        controller.enqueue({
          type: 'return',
          value: result.value,
        });
        controller.close();
        return;
      }

      controller.enqueue({
        type: 'yield',
        value: result.value,
      });
    },
  });
}
