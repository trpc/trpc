import { createDeferred } from './createDeferred';

// ---------- utils

const cancelledStreamSymbol = Symbol();
/**
 * One-off readable stream
 */
export function createReadableStream<TValue = unknown>() {
  let controller: ReadableStreamDefaultController<TValue> =
    null as unknown as ReadableStreamDefaultController<TValue>;

  const deferred = createDeferred<typeof cancelledStreamSymbol>();
  let cancelled = false;
  const readable = new ReadableStream<TValue>({
    start(c) {
      controller = c;
    },
    cancel() {
      deferred.resolve(cancelledStreamSymbol);
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
export function isCancelledStreamResult(
  v: unknown,
): v is typeof cancelledStreamSymbol {
  return v === cancelledStreamSymbol;
}
