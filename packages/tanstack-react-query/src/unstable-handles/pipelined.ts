import type { QueryFunctionContext } from '@tanstack/react-query';
import { skipToken } from '@tanstack/react-query';
import { TRPCClientError } from '@trpc/client';
import type { PipelinedCall } from '@trpc/client/unstable-internals';
import { readPipelinedItem } from '@trpc/server/unstable-core-do-not-import';
import type { EntryQueryOptions } from './entry';
import type { Outcome } from './outcome';
import { failed, ok } from './outcome';
import { isPlainObject } from './utils';

/**
 * Whether two cursors are the same. Only what can be shown to be: equal
 * primitives, of the same type, and plain objects and arrays of them. A date
 * is the same only as a date of the same time. Anything else, such as a
 * class instance a transformer keeps, is not, so the page is fetched by
 * itself rather than recorded with another cursor. No cursor isn't `null`.
 */
export function sameCursor(a: unknown, b: unknown): boolean {
  // `NaN` is the same cursor as `NaN`, and `-0` as `0`
  if (a === b || Object.is(a, b)) {
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
      a.every((item, index) => sameCursor(item, b[index]))
    );
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    // An `undefined` value is no key, as a query key reads it
    const keysOf = (value: Record<string, unknown>) =>
      Object.keys(value).filter((key) => value[key] !== undefined);
    const keys = keysOf(a);
    return (
      keys.length === keysOf(b).length &&
      keys.every(
        (key) =>
          Object.prototype.hasOwnProperty.call(b, key) &&
          sameCursor(a[key], b[key]),
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

const notRun: PipelinedOutcome = { kind: 'notRun' };

/** A failure of the call: its own error if it ran, else it didn't run */
function failureOfCall(call: PipelinedCall, error: unknown): PipelinedOutcome {
  return call.status === 'unresolved' ? notRun : { kind: 'error', error };
}

/** What a call that runs once settled to. Never rejects */
export function outcomeOfCall(call: PipelinedCall): Promise<PipelinedOutcome> {
  return call.result.then(
    (result): PipelinedOutcome => ({ kind: 'data', data: result.data }),
    (error: unknown) => failureOfCall(call, error),
  );
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
 * One item's outcome of a call that the server ran for every item. The
 * call's data is its `items`: a `{ result }` or an `{ error }` for every
 * item, at `indexes`. `null` for an item the server ran no call for. Each
 * item has its own: a call that failed as a whole ran for none of them, so
 * none has its error. Never rejects
 */
export function outcomeOfItem(
  call: PipelinedCall,
  indexes: number[] | null,
): Promise<PipelinedOutcome> {
  return call.result.then(
    async (result): Promise<PipelinedOutcome> => {
      if (!indexes) {
        return notRun;
      }
      try {
        const item = await readPipelinedItem(result.data, indexes);
        switch (item.kind) {
          case 'data':
            return { kind: 'data', data: item.data };
          case 'error':
            return {
              kind: 'error',
              error: TRPCClientError.from({ error: item.error } as any),
            };
          case 'missing':
            return notRun;
        }
      } catch (error) {
        // A streamed run that failed as it came
        return failureOfCall(call, error);
      }
    },
    // The call failed as a whole, such as for too many items: it ran for none
    () => notRun,
  );
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
