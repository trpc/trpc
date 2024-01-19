import type { CreateTRPCClient } from '@trpc/client';
import {
  clientCallTypeToProcedureType,
  createTRPCUntypedClient,
} from '@trpc/client';
import type { AnyRouter } from '@trpc/server/unstable-core-do-not-import';
import { createRecursiveProxy } from '@trpc/server/unstable-core-do-not-import';
import type { CreateTRPCNextAppRouterOptions } from './shared';

export {
  // ts-prune-ignore-next
  experimental_createActionHook,
  // ts-prune-ignore-next
  experimental_serverActionLink,
  // ts-prune-ignore-next
  type UseTRPCActionResult,
} from './create-action-hook';

type QueryResult = {
  data?: unknown;
  error?: unknown;
  promise?: Promise<unknown>;
};

// ts-prune-ignore-next
export function experimental_createTRPCNextAppDirClient<
  TRouter extends AnyRouter,
>(opts: CreateTRPCNextAppRouterOptions<TRouter>) {
  const client = createTRPCUntypedClient<TRouter>(opts.config());
  // const useProxy = createUseProxy<TRouter>(client);

  const cache = new Map<string, QueryResult>();

  return createRecursiveProxy(({ path, args }) => {
    // const pathCopy = [key, ...path];
    const pathCopy = [...path];
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const procedureType = clientCallTypeToProcedureType(pathCopy.pop()!);

    if (procedureType === 'query') {
      const queryCacheKey = JSON.stringify([path, args[0]]);
      const cached = cache.get(queryCacheKey);

      if (cached?.promise) {
        return cached.promise;
      }
    }

    const fullPath = pathCopy.join('.');

    const promise: Promise<unknown> = (client as any)[procedureType](
      fullPath,
      ...args,
    );
    if (procedureType !== 'query') {
      return promise;
    }

    const queryCacheKey = JSON.stringify([path, args[0]]);

    cache.set(queryCacheKey, {
      promise,
    });

    return promise;
  }) as CreateTRPCClient<TRouter>;
  // });
}
