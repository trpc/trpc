/**
 * Creates a ReadableStream from an AsyncIterable
 * Handles proper cleanup and cancellation of the underlying iterator
 *
 * @param iterable - The AsyncIterable to convert into a ReadableStream
 * @returns A ReadableStream that emits the values from the AsyncIterable
 */
export function readableStreamFrom<TYield>(
  iterable: AsyncIterable<TYield, void>,
) {
  // Get the iterator from the iterable
  const iterator = iterable[Symbol.asyncIterator]();

  return new ReadableStream<TYield>({
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
        controller.close();
        return;
      }

      // Enqueue the yielded value
      controller.enqueue(result.value);
    },
  });
}
