// import "server-only";

import type { TRPCLink } from '@trpc/client';
import { TRPCClientError } from '@trpc/client';
import {
  getTransformer,
  type TransformerOptions,
} from '@trpc/client/unstable-internals';
import { observable } from '@trpc/server/observable';
import type {
  AnyRouter,
  AnyTRPCDeclaredErrorClass,
  inferClientTypes,
  inferRouterContext,
} from '@trpc/server/unstable-core-do-not-import';
import {
  callProcedure,
  getErrorShape,
  getProcedureAtPath,
  getTRPCErrorFromUnknown,
  isTRPCDeclaredError,
  resolveRegisteredDeclaredErrorOrDowngrade,
} from '@trpc/server/unstable-core-do-not-import';
import { unstable_cache } from 'next/cache';
import { generateCacheTag } from '../shared';

type NextCacheLinkOptions<TRouter extends AnyRouter> = {
  router: TRouter;
  createContext: () => Promise<inferRouterContext<TRouter>>;
  /** how many seconds the cache should hold before revalidating */
  revalidate?: number | false;
} & TransformerOptions<inferClientTypes<TRouter>>;

// ts-prune-ignore-next
export function experimental_nextCacheLink<TRouter extends AnyRouter>(
  opts: NextCacheLinkOptions<TRouter>,
): TRPCLink<TRouter> {
  const transformer = getTransformer(opts.transformer);
  return () =>
    ({ op }) =>
      observable((observer) => {
        const { path, input, type, context } = op;

        const cacheTag = generateCacheTag(path, input);
        // Let per-request revalidate override global revalidate
        const requestRevalidate =
          typeof context['revalidate'] === 'number' ||
          context['revalidate'] === false
            ? context['revalidate']
            : undefined;
        const revalidate = requestRevalidate ?? opts.revalidate ?? false;

        const promise = opts
          .createContext()
          .then(async (ctx) => {
            const procedure = await getProcedureAtPath(opts.router, path);
            const declaredErrors = procedure?._def.declaredErrors as
              | readonly AnyTRPCDeclaredErrorClass[]
              | undefined;

            const callProc = async (_cachebuster: string) => {
              // _cachebuster is not used by us but to make sure
              // that calls with different tags are properly separated
              // @link https://github.com/trpc/trpc/issues/4622
              try {
                const procedureResult = await callProcedure({
                  router: opts.router,
                  path,
                  getRawInput: async () => input,
                  ctx: ctx,
                  type,
                  signal: undefined,
                  batchIndex: 0,
                });

                // We need to serialize cause the cache only accepts JSON
                return transformer.input.serialize(procedureResult);
              } catch (cause) {
                const error = getTRPCErrorFromUnknown(cause);
                const resolvedError = isTRPCDeclaredError(error)
                  ? resolveRegisteredDeclaredErrorOrDowngrade(error, {
                      declaredErrors,
                      path,
                    })
                  : error;

                throw TRPCClientError.from(
                  {
                    error: getErrorShape({
                      config: opts.router._def._config,
                      ctx,
                      error: resolvedError,
                      input,
                      path,
                      type,
                    }),
                  },
                  { cause: resolvedError },
                );
              }
            };

            if (type === 'query') {
              return unstable_cache(callProc, path.split('.'), {
                revalidate,
                tags: [cacheTag],
              })(cacheTag);
            }

            return callProc(cacheTag);
          })
          .catch((cause) => {
            observer.error(TRPCClientError.from(cause));
          });

        promise
          .then((data) => {
            const transformedResult = transformer.output.deserialize(data);
            observer.next({ result: { data: transformedResult } });
            observer.complete();
          })
          .catch((cause) => {
            observer.error(TRPCClientError.from(cause));
          });
      });
}
