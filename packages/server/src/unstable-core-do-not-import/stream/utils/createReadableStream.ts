import { createDeferred } from './createDeferred';

// ---------- utils
/**
 * One-off readable stream
 */
export function createReadableStream<TValue = unknown>() {
  let controller: ReadableStreamDefaultController<TValue> =
    null as unknown as ReadableStreamDefaultController<TValue>;

  const deferred = createDeferred<null>();
  let cancelled = false;
  const readable = new ReadableStream<TValue>({
    start(c) {
      controller = c;
    },
    cancel() {
      deferred.resolve(null);
      cancelled = true;
    },
  });

  return {
    readable,
    controller,
    cancelledPromise: deferred.promise,
    cancelled() {
      return cancelled;
    },
  } as const;
}
