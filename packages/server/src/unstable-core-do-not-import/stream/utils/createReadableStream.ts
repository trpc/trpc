/**
 * One-off readable stream
 */
export function createReadableStream<TValue = unknown>() {
  let controller: ReadableStreamDefaultController<TValue> =
    null as unknown as ReadableStreamDefaultController<TValue>;

  let cancelled = false;
  const readable = new ReadableStream<TValue>({
    start(c) {
      controller = c;
    },
    cancel() {
      cancelled = true;
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
