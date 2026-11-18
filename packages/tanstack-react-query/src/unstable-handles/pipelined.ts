import type {
  QueryFunction,
  QueryFunctionContext,
} from '@tanstack/react-query';
import { hashKey } from '@tanstack/react-query';
import { TRPCClientError } from '@trpc/client';
import type { PipelinedCall } from '@trpc/client/unstable-internals';
import { readPipelinedItem } from '@trpc/server/unstable-core-do-not-import';
import { nothing } from './utils';

/**
 * Whether two cursors are the same. No cursor isn't `null`, though JSON, and
 * so `hashKey`, writes both alike
 */
export const sameCursor = (a: unknown, b: unknown) =>
  a === undefined || b === undefined ? a === b : hashKey([a]) === hashKey([b]);

/**
 * Makes the first fetch of a query use the result of a call that the server
 * made in an earlier request, before the query's key was known.
 */
export function withPipelinedResult(opts: {
  options: any;
  result: Promise<unknown>;
  /** Whether the call didn't run, so the request has to be made */
  unresolved: () => boolean;
  /**
   * Whether the call is the request this fetch would make: the server filled
   * in the same input as this client did
   */
  sameInput: (context: QueryFunctionContext<any, any>) => Promise<boolean>;
}) {
  const queryFn: QueryFunction<any, any, any> = opts.options.queryFn;
  let result: Promise<unknown> | null = opts.result;
  return {
    ...opts.options,
    queryFn: async (context: QueryFunctionContext<any, any>) => {
      const pipelined = result;
      result = null;
      if (
        !pipelined ||
        // If what the server read can't be read here, such as a failed request
        !(await opts.sameInput(context).catch(() => false))
      ) {
        return queryFn(context);
      }
      try {
        return await pipelined;
      } catch (error) {
        // Such as when the entry it reads failed and was retried
        if (opts.unresolved()) {
          return queryFn(context);
        }
        throw error;
      }
    },
  };
}

/** The data of a call the server made in another's request */
export function dataOfCall(call: PipelinedCall) {
  const data = call.result.then((result) => result.data);
  // Used only if the query fetches
  data.catch(nothing);
  return data;
}

/**
 * One item's result of a call that the server ran for every item. The call's
 * data is its `items`: a `{ result }` or an `{ error }` for every item, at
 * `indexes`. `null` for an item the server ran no call for.
 */
export function resultOfItem(
  results: Promise<unknown>,
  indexes: number[] | null,
) {
  let missing = false;
  const result = results.then(
    async (data) => {
      const item = indexes
        ? await readPipelinedItem(data, indexes)
        : ({ kind: 'missing' } as const);
      switch (item.kind) {
        case 'data':
          return item.data;
        case 'error':
          throw TRPCClientError.from({ error: item.error } as any);
        case 'missing':
          missing = true;
          throw new Error(
            `The server sent no result for item ${JSON.stringify(indexes)}`,
          );
      }
    },
    (error: unknown) => {
      // The call failed as a whole, such as for too many items: it ran for none
      missing = true;
      throw error;
    },
  );
  // Used only if the item's query fetches
  result.catch(nothing);
  return {
    result,
    /** Whether the server didn't run the call for this item */
    missing: () => missing,
  };
}
