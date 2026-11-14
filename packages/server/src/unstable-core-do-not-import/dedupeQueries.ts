import { isPlainObject } from '../vendor/is-plain-object';
import type { MiddlewareResult } from './middleware';
import { createMiddlewareFactory } from './middleware';
import { isPromise } from './stream/jsonl';
import { iteratorResource } from './stream/utils/asyncIterable';
import type { CombinedDataTransformer } from './transformer';
import { isAsyncIterable, isObject } from './utils';

/**
 * A value as JSON with the keys of its objects sorted, as TanStack Query
 * hashes a query key. `null` for a value that isn't the same after a trip
 * through JSON, and so has the JSON of another value: a `Map`, a `Date`, a
 * `bigint`, `NaN`, an `undefined` in an array.
 */
function toSortedJson(
  value: unknown,
  /** The objects and arrays that `value` is inside */
  parents: readonly object[],
): string | null {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) && !Object.is(value, -0)
      ? JSON.stringify(value)
      : null;
  }
  if (typeof value !== 'object' || parents.includes(value)) {
    return null;
  }
  const inside = [...parents, value];
  if (Array.isArray(value)) {
    const items = Array.from(value, (item: unknown) =>
      toSortedJson(item, inside),
    );
    return items.includes(null) ? null : `[${items.join(',')}]`;
  }
  if (!isPlainObject(value)) {
    return null;
  }
  const properties = Object.keys(value)
    .sort()
    // As in JSON, a property that is `undefined` is one that isn't there
    .filter((key) => value[key] !== undefined)
    .map((key) => {
      const json = toSortedJson(value[key], inside);
      return json === null ? null : `${JSON.stringify(key)}:${json}`;
    });
  return properties.includes(null) ? null : `{${properties.join(',')}}`;
}

type InputHashFn = (call: {
  /**
   * The transformer of `initTRPC.create()`, or one that changes nothing.
   * `transformer.input.serialize(input)` is the input as the client sends it.
   */
  transformer: CombinedDataTransformer;
  /** The input before it is validated */
  input: unknown;
  /** The procedure's path, such as `post.byId` */
  path: string;
}) => string | null;

const defaultInputHashFn: InputHashFn = (call) => {
  try {
    const encoded: unknown = call.transformer.input.serialize(call.input);
    // `undefined` has no JSON, and no JSON is ''
    return encoded === undefined ? '' : toSortedJson(encoded, []);
  } catch {
    // An input that the transformer can't encode
    return null;
  }
};

/** The copies of a value that the calls sharing a run get, one each */
interface Copies {
  /** The next copy. Every copy is either taken or dropped, once */
  take(): unknown;
  /** Gives up the next copy, which no call will read */
  drop(): void;
}

/** What a branch of a split stream has yet to read */
type Queued =
  | { type: 'value'; done: boolean; copies: Copies }
  | { type: 'error'; error: unknown };

/**
 * Splits a stream into `count` branches that each yield what the stream
 * yields, with their own copy of every value. The stream is read once, when
 * the first branch asks for a value, and what the other branches haven't read
 * yet is kept for them. It is returned once: when it has ended or failed, as
 * the JSONL encoder returns a stream it has read, or when every branch has
 * been returned.
 */
function splitAsyncIterable(
  source: AsyncIterable<unknown>,
  count: number,
): Copies {
  let iterator: (AsyncIterator<unknown> & AsyncDisposable) | null = null;
  /** `null` for a branch that has finished or been returned */
  const queues: (Queued[] | null)[] = Array.from({ length: count }, () => []);
  /** The read of the stream in flight, for every branch that waits for it */
  let reading: Promise<void> | null = null;
  /** The stream has nothing more to give, and has been returned */
  let ended = false;
  let branches = 0;

  async function end() {
    if (ended) {
      return;
    }
    ended = true;
    // Calls its `return()`, or the disposer of an iterator that has one
    await using _source = iterator;
  }

  async function read() {
    let queued: (live: number) => Queued;
    try {
      iterator ??= iteratorResource(source);
      const step = await iterator.next();
      const done = step.done === true;
      if (done) {
        await end();
      }
      queued = (live) => ({
        type: 'value',
        done,
        // A value can have streams of its own
        copies: shareAmong(step.value, live),
      });
    } catch (error) {
      await end().catch(() => {
        // The calls get the failure of the stream, not of returning it
      });
      queued = () => ({ type: 'error', error });
    }
    // The branches that were returned meanwhile get nothing
    const live = queues.filter((queue) => queue !== null);
    if (live.length > 0) {
      const item = queued(live.length);
      for (const queue of live) {
        queue.push(item);
      }
    }
  }

  async function release(index: number) {
    const queue = queues[index];
    if (!queue) {
      return;
    }
    queues[index] = null;
    for (const item of queue) {
      if (item.type === 'value') {
        item.copies.drop();
      }
    }
    if (queues.every((other) => other === null)) {
      await end();
    }
  }

  function branch(index: number): AsyncIterableIterator<unknown> {
    return {
      async next() {
        while (true) {
          const queue = queues[index];
          if (!queue) {
            return { done: true, value: undefined };
          }
          const item = queue.shift();
          if (!item) {
            reading ??= read().then(() => {
              reading = null;
            });
            await reading;
            continue;
          }
          if (item.type === 'error') {
            queues[index] = null;
            throw item.error;
          }
          if (item.done) {
            queues[index] = null;
          }
          return { done: item.done, value: item.copies.take() };
        }
      },
      async return(value: unknown) {
        await release(index);
        return { done: true, value };
      },
      [Symbol.asyncIterator]() {
        return this;
      },
    };
  }

  return {
    take: () => branch(branches++),
    drop() {
      release(branches++).catch(() => {
        // The stream failed to return, and no call is left to tell
      });
    },
  };
}

/**
 * Copies of a promise or a stream, which only one call can read. `null` for
 * any other value.
 */
function shareAsyncAmong(value: unknown, count: number): Copies | null {
  if (isPromise(value)) {
    // What it resolves to can have streams of its own
    const copies = value.then((resolved) => shareAmong(resolved, count));
    return {
      take: () => copies.then((resolved) => resolved.take()),
      drop() {
        copies.then(
          (resolved) => resolved.drop(),
          () => {
            // The calls that took a copy get the rejection
          },
        );
      },
    };
  }
  if (isAsyncIterable(value)) {
    return splitAsyncIterable(value, count);
  }
  return null;
}

/**
 * Copies of a run's data for `count` calls. A promise or a stream is split
 * where the JSONL encoder would stream it: when it is the data, a property of
 * a plain object that is the data, or the same in what a promise resolves to
 * or a stream yields. Everything else is the same value in every copy.
 */
function shareAmong(value: unknown, count: number): Copies {
  const same: Copies = {
    take: () => value,
    drop() {
      // Nothing was split
    },
  };
  if (count < 2) {
    return same;
  }
  const split = shareAsyncAmong(value, count);
  if (split) {
    return split;
  }
  if (!isPlainObject(value)) {
    return same;
  }
  const properties = Object.entries(value).flatMap(([key, property]) => {
    const copies = shareAsyncAmong(property, count);
    return copies ? [{ key, copies }] : [];
  });
  if (properties.length === 0) {
    return same;
  }
  return {
    take: () => ({
      ...value,
      ...Object.fromEntries(
        properties.map((property) => [property.key, property.copies.take()]),
      ),
    }),
    drop() {
      for (const property of properties) {
        property.copies.drop();
      }
    },
  };
}

/** A run of a query, in flight */
interface Run {
  /** How many calls get its result. Calls join it while it is in the map. */
  calls: number;
  /** Resolves when the run settles, to what gives each call its result */
  settled: Promise<() => MiddlewareResult<object>>;
}

/**
 * A middleware that runs a query once for the calls that start at the same
 * time with the same context, path and input, such as two calls for one
 * author in a batch. Every call gets the data or the error of that run, and
 * its own copy of what the data streams.
 * Mutations and subscriptions run for every call, and so does a query that
 * starts later, which may follow a mutation.
 *
 * Use it before any middleware that changes the context or waits: an HTTP
 * request's calls share one context object and reach the middleware together,
 * until a middleware gives each its own context or holds one back.
 *
 * Unstable: it may change in a minor release.
 * @see https://trpc.io/docs/server/middlewares#dedupe-queries
 */
export function unstable_dedupeQueries(opts?: {
  /**
   * Hashes a call's input. Calls with the same path and hash share a run.
   * Return `null` for a call that should run for itself.
   * @default The input as the transformer encodes it for the client to send
   * (`transformer.input.serialize(input)`), hashed as TanStack Query hashes
   * a query key: as JSON, with the keys of its objects sorted. An input that
   * still isn't JSON after that, such as a `Map` without a transformer that
   * encodes it, runs for itself.
   */
  inputHashFn?: InputHashFn;
}) {
  const inputHashFn = opts?.inputHashFn ?? defaultInputHashFn;
  /** The runs that calls can still join, for each context */
  const runs = new WeakMap<object, Map<string, Run>>();

  return createMiddlewareFactory<object, object>()(async (call) => {
    if (call.type !== 'query' || !isObject(call.ctx)) {
      return call.next();
    }
    const hash = await call.getRawInput().then(
      (input) =>
        inputHashFn({
          transformer: call.transformer,
          input,
          path: call.path,
        }),
      // The procedure reports an input that can't be read
      () => null,
    );
    if (hash === null) {
      return call.next();
    }
    const key = JSON.stringify([call.path, hash]);
    const ofContext = runs.get(call.ctx) ?? new Map<string, Run>();
    runs.set(call.ctx, ofContext);

    let run = ofContext.get(key);
    if (run) {
      run.calls++;
    } else {
      const forget = () => {
        // A later run may have taken its place
        if (ofContext.get(key) === started) {
          ofContext.delete(key);
        }
      };
      // The calls of a batch get here in one macrotask. A call that comes
      // after it runs for itself: a context can outlive a request, as a
      // WebSocket connection's does, and that call may follow a mutation
      const joining = setTimeout(forget, 0);
      const started: Run = {
        calls: 1,
        settled: call
          .next()
          .finally(() => {
            clearTimeout(joining);
            forget();
          })
          .then((result) => {
            // No call can join a run that isn't in the map, so this is every
            // call that gets the result
            if (!result.ok || started.calls === 1) {
              return () => result;
            }
            const copies = shareAmong(result.data, started.calls);
            return () => ({ ...result, data: copies.take() });
          }),
      };
      ofContext.set(key, started);
      run = started;
    }
    const take = await run.settled;
    return take();
  });
}
