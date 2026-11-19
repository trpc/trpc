import type { QueryFunctionContext } from '@tanstack/react-query';
import { skipToken } from '@tanstack/react-query';
import type { PipelinedCall } from '@trpc/client/unstable-internals';
import { readPipelinedRun } from '@trpc/client/unstable-internals';
import type { EntryQueryOptions } from './entry';
import type { Outcome } from './outcome';
import { failed, ok } from './outcome';
import { isPlainObject } from './utils';

/**
 * Whether two inputs, query keys or cursors are the same request. Only what
 * can be shown to be: equal primitives, of the same type, and plain objects
 * and arrays of them. A date is the same only as a date of the same time.
 * Anything else, such as a class instance a transformer keeps, is not, so
 * the query is fetched by itself rather than recorded with another's
 * result. Not their cache hash, which is JSON: no value isn't `null`, no
 * key isn't a key whose value is `undefined`, a hole in an array isn't a
 * value, and `-0` isn't `0`.
 */
export function sameValue(a: unknown, b: unknown): boolean {
  // `NaN` is the same value as `NaN`. `-0` is not `0`: a transformer that
  // keeps it, such as superjson, lets a resolver tell them apart
  if (Object.is(a, b)) {
    return true;
  }
  if (a instanceof Date || b instanceof Date) {
    return (
      a instanceof Date && b instanceof Date && a.getTime() === b.getTime()
    );
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      // Every index, also a hole: `every()` skips one, and a hole is not the
      // value at that index, as a missing key isn't
      Array.from(
        { length: a.length },
        (_, index) =>
          index in a === index in b && sameValue(a[index], b[index]),
      ).every(Boolean)
    );
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    // A key whose value is `undefined` is not a missing key: a transformer
    // that keeps it, such as superjson, lets a resolver tell them apart
    const keys = Object.keys(a);
    return (
      keys.length === Object.keys(b).length &&
      keys.every(
        (key) =>
          Object.prototype.hasOwnProperty.call(b, key) &&
          sameValue(a[key], b[key]),
      )
    );
  }
  return false;
}

/**
 * What a call that the server made in another's request settled to, for the
 * query that would make the same request:
 * - `data`: the query's data.
 * - `error`: it ran and failed. That is the query's error.
 * - `notRun`: it didn't run, such as when its request failed as a whole or
 *   the server refused it. The query makes its request itself.
 */
export type PipelinedOutcome =
  | { readonly kind: 'data'; readonly data: unknown }
  | { readonly kind: 'error'; readonly error: unknown }
  | { readonly kind: 'notRun' };

/** A call that didn't run, for the query to make its request itself */
export const notRun: PipelinedOutcome = { kind: 'notRun' };

/**
 * What a call that runs once settled to: its data, or its own error if it
 * ran and failed. Never rejects
 */
export function outcomeOfCall(call: PipelinedCall): Promise<PipelinedOutcome> {
  return call.settled.then((settled): PipelinedOutcome => {
    if (settled.status === 'not-run') {
      return notRun;
    }
    const { outcome } = settled;
    if (!outcome.ok) {
      return { kind: 'error', error: outcome.error };
    }
    return outcome.data.kind === 'once'
      ? { kind: 'data', data: outcome.data.data }
      : // A call for every item is read by item, with `outcomeOfItem()`
        notRun;
  });
}

/** A call's data, as the outcome of what the server read. Never rejects */
export function dataOfCall(call: PipelinedCall): Promise<Outcome<unknown>> {
  return outcomeOfCall(call).then((outcome) =>
    outcome.kind === 'data'
      ? ok(outcome.data)
      : failed(outcome.kind === 'error' ? outcome.error : null),
  );
}

/**
 * One item's outcome of a call that the server ran for every item, at
 * `indexes`: `null` for an item the server ran no call for. Each item has
 * its own. A call that failed as a whole ran for none of them, so none has
 * its error. A run's error, also one the link couldn't read, is a
 * `TRPCClientError` already, and is the item's as it is. Never rejects
 */
export function outcomeOfItem(
  call: PipelinedCall,
  indexes: number[] | null,
): Promise<PipelinedOutcome> {
  return call.settled.then(async (settled): Promise<PipelinedOutcome> => {
    if (
      !indexes ||
      settled.status === 'not-run' ||
      !settled.outcome.ok ||
      settled.outcome.data.kind !== 'each'
    ) {
      return notRun;
    }
    const item = await readPipelinedRun(settled.outcome.data.runs, indexes);
    switch (item.kind) {
      case 'data':
        return { kind: 'data', data: item.data };
      case 'error':
        return { kind: 'error', error: item.error };
      case 'missing':
        return notRun;
    }
  });
}

/**
 * Makes the first fetch of a query use the result of a call that the server
 * made in an earlier request, before the query's key was known.
 */
export function withPipelinedResult(opts: {
  options: EntryQueryOptions;
  result: Promise<PipelinedOutcome>;
  /**
   * Whether the call is the request this fetch would make: the server filled
   * in the same input as this client did. Never rejects: what can't be
   * compared isn't the same
   */
  sameInput: (context: QueryFunctionContext<any, any>) => Promise<boolean>;
}): EntryQueryOptions {
  const { queryFn } = opts.options;
  if (queryFn === skipToken) {
    // Disabled: it never fetches
    return opts.options;
  }
  let result: Promise<PipelinedOutcome> | null = opts.result;
  return {
    ...opts.options,
    queryFn: async (context: QueryFunctionContext<any, any>) => {
      const pipelined = result;
      result = null;
      if (!pipelined || !(await opts.sameInput(context))) {
        return queryFn(context);
      }
      const outcome = await pipelined;
      switch (outcome.kind) {
        case 'data':
          return outcome.data;
        case 'error':
          throw outcome.error;
        case 'notRun':
          // Such as when the entry it reads failed and was retried
          return queryFn(context);
      }
    },
  };
}
