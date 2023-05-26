import {
  clientCallTypeToProcedureType,
  createTRPCUntypedClient,
} from '@trpc/client';
import { AnyRouter } from '@trpc/server';
import { createFlatProxy, createRecursiveProxy } from '@trpc/server/shared';
import { CreateTRPCNextAppRouterOptions, generateCacheTag } from './shared';
import { NextAppDirDecoratedProcedureRecord } from './types';

export {
  // ts-prune-ignore-next
  experimental_createActionHook,
  // ts-prune-ignore-next
  experimental_serverActionLink,
  // ts-prune-ignore-next
  type UseTRPCActionResult,
  // ts-prune-ignore-next
  type inferActionResultProps,
} from './create-action-hook';

// function normalizePromiseArray<TValue>(
//   promise: Promise<TValue> | Promise<TValue>[],
// ) {
//   if (Array.isArray(promise)) {
//     return Promise.all(promise);
//   }
//   return promise;
// }

type QueryResult = {
  data?: unknown;
  error?: unknown;
  promise?: Promise<unknown>;
};

declare global {
  interface Window {
    trpcCache?: Record<string, QueryResult>;
  }
}

// ts-prune-ignore-next
export function experimental_createTRPCNextAppDirClient<
  TRouter extends AnyRouter,
>(opts: CreateTRPCNextAppRouterOptions<TRouter>) {
  const client = createTRPCUntypedClient<TRouter>(opts.config());
  // const useProxy = createUseProxy<TRouter>(client);

  const __serverCache: Record<string, QueryResult> = {};
  const getCache = (): Record<string, QueryResult> => {
    if (typeof window === 'undefined') {
      console.log('[getCache]: using server cache', __serverCache);
      return __serverCache;
    }
    if (!window.trpcCache) {
      window.trpcCache = {};
    }
    console.log('[getCache]: using window cache', window.trpcCache);
    return window.trpcCache;
  };

  return createFlatProxy<
    NextAppDirDecoratedProcedureRecord<TRouter['_def']['record']> & {
      cache: Record<string, QueryResult>;
    }
  >((key) => {
    const cache = getCache();

    if (key === 'cache') {
      return cache;
    }

    return createRecursiveProxy(({ path, args }) => {
      const pathCopy = [key, ...path];
      const action = pathCopy.pop() as string;

      const fullPath = pathCopy.join('.');
      const procedureType = clientCallTypeToProcedureType(action);
      const cacheTag = generateCacheTag(fullPath, args[0]);

      if (action === 'revalidate') {
        // invalidate client cache
        delete cache[cacheTag];

        // invaldiate server cache
        const revalidatePromise = fetch('/api/trpc/revalidate', {
          method: 'POST',
          body: JSON.stringify({
            cacheTag,
          }),
        });
        return revalidatePromise.then((res) => res.json());
      }

      // only use record cache on client? server can rely on next.js cache
      // and get  a cached response when doing the `fetch`?
      if (procedureType === 'query' && typeof window !== 'undefined') {
        const cached = cache[cacheTag];

        console.log('[query]: cahced?', !!cached);
        console.log('[query]: has promise', !!cached?.promise);

        if (cached) {
          if (!cached.promise) {
            // Turning hydrated JSON into a promise
            if (cached.data) {
              cached.promise = Promise.resolve(cached.data);
            } else if (cached.error) {
              cached.promise = Promise.reject(cached.error);
            }
          }

          return cached.promise;
        }
      }

      const promise: Promise<unknown> = (client as any)[procedureType](
        fullPath,
        ...args,
      );
      if (procedureType !== 'query') {
        return promise;
      }

      console.log('[query]: setting cache', cacheTag);
      cache[cacheTag] = { promise };

      promise
        .then((data) => {
          cache[cacheTag] = {
            ...cache[cacheTag],
            data,
            error: null,
          };
        })
        .catch((error) => {
          cache[cacheTag] = {
            ...cache[cacheTag],
            error,
            data: null,
          };
        });

      return promise;
    });
  });
}
