import { TRPCClient, TRPCClientError, TRPCRequestOptions } from '@trpc/client';
import { AnyRouter, inferHandlerInput } from '@trpc/server';

export function createSafeClient<TRouter extends AnyRouter>(
  client: TRPCClient<TRouter>,
) {
  type AsyncFn<T> = (...args: any[]) => Promise<T> | T;
  /**
   * Wrap a function in a safe wrapper that never throws
   * Returns a discriminated union
   */
  async function wrapCallSafe<TData>(fn: AsyncFn<TData>) {
    try {
      const data = await fn();
      return {
        ok: true as const,
        data,
      };
    } catch (cause) {
      return {
        ok: false as const,
        error: cause as TRPCClientError<TRouter>,
      };
    }
  }

  function query<
    TQueries extends TRouter['_def']['queries'],
    TPath extends string & keyof TQueries,
  >(
    path: TPath,
    ...args: [...inferHandlerInput<TQueries[TPath]>, TRPCRequestOptions?]
  ) {
    return wrapCallSafe(() => client.query(path, ...args));
  }
  function mutation<
    TMutations extends TRouter['_def']['mutations'],
    TPath extends string & keyof TMutations,
  >(
    path: TPath,
    ...args: [...inferHandlerInput<TMutations[TPath]>, TRPCRequestOptions?]
  ) {
    return wrapCallSafe(() => client.mutation(path, ...args));
  }

  return {
    query,
    mutation,
  };
}
