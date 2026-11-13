import { isPlainObject } from '../vendor/is-plain-object';
import type { MiddlewareResult } from './middleware';
import { createMiddlewareFactory } from './middleware';
import { isPromise } from './stream/jsonl';
import { isAsyncIterable, isObject } from './utils';

/**
 * Hashes an input as TanStack Query hashes a query key: as JSON, with the keys
 * of its objects sorted. `null` for an input that JSON can't tell from
 * another, such as a `Map`, a `bigint` or `NaN`.
 */
function hashInput(input: unknown) {
  try {
    const json: string | undefined = JSON.stringify(
      input,
      (_key, value: unknown) => {
        if (isPlainObject(value)) {
          return Object.fromEntries(
            Object.keys(value)
              .sort()
              .map((key) => [key, value[key]]),
          );
        }
        if (
          (isObject(value) && !Array.isArray(value)) ||
          (typeof value === 'number' && !Number.isFinite(value))
        ) {
          throw new TypeError('Not JSON');
        }
        return value;
      },
    );
    // `undefined` has no JSON, and isn't `null`
    return json ?? '';
  } catch {
    return null;
  }
}

/**
 * Whether two calls can get this data. A stream can only be read once, and a
 * promise may resolve to one.
 */
function isShareable(data: unknown) {
  const isAsync = (value: unknown) =>
    isPromise(value) || isAsyncIterable(value);
  return (
    !isAsync(data) &&
    !(isPlainObject(data) && Object.values(data).some(isAsync))
  );
}

/**
 * A middleware that runs a query once for the calls that are in flight at the
 * same time with the same context, path and input, such as two calls for one
 * author in a batch. Every call gets the data or the error of that run.
 * Mutations and subscriptions run for every call.
 *
 * Use it before any middleware that changes the context: an HTTP request's
 * calls share one context object, until a middleware gives each its own.
 *
 * Experimental: it may change in a minor release.
 * @see https://trpc.io/docs/server/middlewares#dedupe-queries
 */
export function experimental_dedupeQueries(opts?: {
  /**
   * Hashes a call's input. Calls with the same path and hash share a run.
   * Return `null` for a call that should run for itself. `input` is the
   * input before it is validated.
   * @default The input hashed as TanStack Query hashes a query key: as JSON,
   * with the keys of its objects sorted. An input that JSON can't carry, such
   * as a `Map` or a `bigint`, runs for itself.
   */
  inputHashFn?: (call: { path: string; input: unknown }) => string | null;
}) {
  const inputHashFn = opts?.inputHashFn ?? ((call) => hashInput(call.input));
  /** The runs in flight, for each context */
  const runs = new WeakMap<
    object,
    Map<string, Promise<MiddlewareResult<object>>>
  >();

  return createMiddlewareFactory<object, object>()(async (call) => {
    if (call.type !== 'query' || !isObject(call.ctx)) {
      return call.next();
    }
    const hash = await call.getRawInput().then(
      (input) => inputHashFn({ path: call.path, input }),
      // The procedure reports an input that can't be read
      () => null,
    );
    if (hash === null) {
      return call.next();
    }
    const key = JSON.stringify([call.path, hash]);
    const ofContext =
      runs.get(call.ctx) ??
      new Map<string, Promise<MiddlewareResult<object>>>();
    runs.set(call.ctx, ofContext);

    const running = ofContext.get(key);
    if (running) {
      const result = await running;
      return result.ok && !isShareable(result.data) ? call.next() : result;
    }
    const started = call.next();
    ofContext.set(key, started);
    // Only while it is in flight: a context can outlive a request, as a
    // WebSocket connection's does
    const forget = () => {
      if (ofContext.get(key) === started) {
        ofContext.delete(key);
      }
    };
    started.then(forget, forget);
    return started;
  });
}
