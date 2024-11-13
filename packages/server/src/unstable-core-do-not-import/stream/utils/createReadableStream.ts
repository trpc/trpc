/**
 * One-off readable stream
 */
export function createReadableStream<TValue = unknown>(
  abortController?: AbortController,
) {
  let controller: ReadableStreamDefaultController<TValue> =
    null as unknown as ReadableStreamDefaultController<TValue>;

  let cancelled = false;
  const readable = new ReadableStream<TValue>({
    start(c) {
      controller = c;
    },
    cancel() {
      cancelled = true;
      abortController?.abort();
    },
  });

  return {
    readable,
    controller,
    cancelled() {
      return cancelled;
    },
  } as const;
}
