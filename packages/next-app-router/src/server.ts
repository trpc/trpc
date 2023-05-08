import { clientCallTypeToProcedureType } from '@trpc/client';
import {
  callProcedure,
  type AnyQueryProcedure,
  type AnyRouter,
  type MaybePromise,
  type inferRouterContext,
} from '@trpc/server';
import { createRecursiveProxy } from '@trpc/server/shared';
import { revalidateTag, unstable_cache } from 'next/cache';
import { type DecoratedProcedureRecord, type QueryResolver } from './types';
import { generateCacheTag } from './utils';

export function createTRPCNextAppRouter<TRouter extends AnyRouter>(config: {
  router: TRouter;

  createContext: () => MaybePromise<inferRouterContext<TRouter>>;
}) {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return createRecursiveProxy(async (opts) => {
    const [input, callOpts] = opts.args as Parameters<
      QueryResolver<AnyQueryProcedure>
    >;

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const action = opts.path.pop()!;
    const procedurePath = opts.path.join('.');
    const cacheTag = generateCacheTag(procedurePath, input);

    // eslint-disable-next-line no-console
    console.log(`[${action}]: Server cacheTag`, cacheTag);

    const type = clientCallTypeToProcedureType(action);

    if (action === 'revalidate') {
      return revalidateTag(cacheTag);
    }

    const ctx = await config.createContext();

    const callProc = async () =>
      callProcedure({
        procedures: config.router._def.procedures,
        path: procedurePath,
        ctx,
        rawInput: input,
        type,
      });

    if (type === 'query') {
      return unstable_cache(
        callProc,
        opts.path, // <- not sure what to put here...
        {
          revalidate: callOpts?.revalidate ?? false,
          tags: [cacheTag],
        },
      )();
    }

    return callProc();
  }) as DecoratedProcedureRecord<TRouter['_def']['record']>;
}
