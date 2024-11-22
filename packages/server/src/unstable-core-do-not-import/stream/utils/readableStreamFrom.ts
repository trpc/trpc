/**
 * Represents a value emitted by the ReadableStream created from an AsyncIterable
 * Can be either a yielded value or a return value when the iterator completes
 */
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
 *
 * @param iterable - The AsyncIterable to convert into a ReadableStream
 * @returns A ReadableStream that emits the values from the AsyncIterable
 */
export function readableStreamFrom<TYield, TReturn>(
  iterable: AsyncIterable<TYield, TReturn>,
) {
  // Get the iterator from the iterable
  const iterator = iterable[Symbol.asyncIterator]();

  return new ReadableStream<IterableToReadableStreamValue<TYield, TReturn>>({
    /**
     * Called when the stream is cancelled
     * Attempts to properly clean up the iterator by calling its return method
     */
    async cancel() {
      try {
        await iterator.return?.();
      } catch {
        // Silently handle any errors during cleanup
        // console.error('Error cleaning up iterator:', err);
      }
    },

    /**
     * Called when the stream needs to pull more data
     * Gets the next value from the iterator and enqueues it to the stream
     */
    async pull(controller) {
      // Get the next value from the iterator
      const result = await iterator.next();

      if (result.done) {
        // If iterator is done, enqueue the return value and close the stream
        controller.enqueue({
          type: 'return',
          value: result.value,
        });
        controller.close();
        return;
      }

      // Enqueue the yielded value
      controller.enqueue({
        type: 'yield',
        value: result.value,
      });
    },
  });
}
