// import "server-only";

import { TRPCClientError, TRPCLink } from '@trpc/client';
import { AnyRouter, callProcedure, inferRouterContext } from '@trpc/server';
import { observable } from '@trpc/server/observable';
import { unstable_cache } from 'next/cache';
import { generateCacheTag } from '../shared';

type NextCacheLinkOptions<TRouter extends AnyRouter> = {
  router: TRouter;
  createContext: () => Promise<inferRouterContext<TRouter>>;
  /** how many seconds the cache should hold before revalidating */
  revalidate?: number | false;
};

// ts-prune-ignore-next
export function experimental_nextCacheLink<TRouter extends AnyRouter>(
  opts: NextCacheLinkOptions<TRouter>,
): TRPCLink<TRouter> {
  return (runtime) =>
    ({ op }) =>
      observable((observer) => {
        const { path, input, type, context } = op;

        const cacheTag = generateCacheTag(path, input);
        // Let per-request revalidate override global revalidate
        const requestRevalidate =
          typeof context.revalidate === 'number' || context.revalidate === false
            ? context.revalidate
            : undefined;
        const revalidate = requestRevalidate ?? opts.revalidate ?? false;

        const promise = opts
          .createContext()
          .then(async (ctx) => {
            const callProc = async () => {
              const procedureResult = await callProcedure({
                procedures: opts.router._def.procedures,
                path,
                rawInput: input,
                ctx: ctx,
                type,
              });

              // We need to serialize cause the cache only accepts JSON
              return runtime.transformer.serialize(procedureResult);
            };

            if (type === 'query') {
              return unstable_cache(callProc, path.split('.'), {
                revalidate,
                tags: [cacheTag],
              })();
            }

            return callProc();
          })
          .catch((cause) => {
            observer.error(TRPCClientError.from(cause));
          });

        promise
          .then((data) => {
            const transformedResult = runtime.transformer.deserialize(data);
            observer.next({ result: { data: transformedResult } });
            observer.complete();
          })
          .catch((cause) => {
            observer.error(TRPCClientError.from(cause));
          });
      });
}
