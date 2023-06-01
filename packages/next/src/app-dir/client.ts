// FIXME: acttivate lint rule
/* eslint-disable no-console */
import {
  clientCallTypeToProcedureType,
  createTRPCUntypedClient,
} from '@trpc/client';
import { AnyRouter } from '@trpc/server';
import { createFlatProxy, createRecursiveProxy } from '@trpc/server/shared';
import { Deferred } from './deferred';
import { CreateTRPCNextAppRouterOptions, generateCacheTag } from './shared';
import { NextAppDirDecoratedProcedureRecord } from './types';

export { Deferred } from './deferred';

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
      console.log('[getCache]: using server cache');
      return __serverCache;
    }
    console.log('[getCache]: using window cache', window.trpcCache);
    if (!window.trpcCache) {
      window.trpcCache = {};
    }
    console.log('[getCache]: using window cache', window.trpcCache);
    return window.trpcCache;
  };

  let refCount = 0;
  let idx = 0;

  const createOnsettledDefferred = () => {
    const onSettledDeferred = new Deferred<void>();
    onSettledDeferred.__id = idx++;

    return onSettledDeferred;
  };
  const refCountZeroDeferred = Promise.resolve();
  let onSettledDeferred = createOnsettledDefferred();
  onSettledDeferred.resolve();

  return createFlatProxy<
    NextAppDirDecoratedProcedureRecord<TRouter['_def']['record']> & {
      cache: Record<string, QueryResult>;
      onSettled: () => Promise<void>;
    }
  >((key) => {
    if (key === 'cache') {
      return getCache();
    }

    const refCountIncrement = () => {
      console.log('[REF] inc');
      refCount++;
      if (refCount === 1) {
        onSettledDeferred = createOnsettledDefferred();
      }
    };
    const refCountDecrement = () => {
      console.log('[REF] dec');
      refCount--;
      if (refCount === 0) {
        onSettledDeferred.resolve();
      }
    };
    if (key === 'onSettled') {
      return async () => {
        console.log('Asked for onSettled', {
          refCount,
          idx: onSettledDeferred.__id,
        });
        return refCount === 0 ? refCountZeroDeferred : onSettledDeferred;
      };
    }

    return createRecursiveProxy(({ path, args }) => {
      const cache = getCache();
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
      if (procedureType === 'query') {
        const cached = cache[cacheTag];

        console.log('[query]: cached?', !!cached);
        console.log('[query]: has promise', !!cached?.promise);

        // wait 1 ms and check again

        if (cached) {
          if (!cached.promise) {
            console.log('[DEHYDRATING]');
            // Turning hydrated JSON into a promise

            if (cached.data) {
              console.log('[DEHYDRATING]: hydrated data', cached.data);
              cached.promise = Promise.resolve(cached.data);
            } else if (cached.error) {
              console.log('[DEHYDRATING]: hydrated error', cached.error);
              cached.promise = Promise.reject(cached.error);
            } else {
              throw new Error('Failed dehydrating');
            }
          }
          console.log('returning promise');

          refCountIncrement();

          cached.promise.finally(() => {
            refCountDecrement();
          });
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

      console.log('---------------------- [query]: setting cache', cacheTag);
      cache[cacheTag] = { promise };

      refCountIncrement();
      console.log({ refCount });

      promise
        .then((data) => {
          console.log('[query]: resolved', data);
          cache[cacheTag] = {
            ...cache[cacheTag],
            data,
            error: null,
          };
        })
        .catch((error) => {
          console.log('[query]: rejected', error);
          cache[cacheTag] = {
            ...cache[cacheTag],
            error,
            data: null,
          };
        })
        .finally(() => {
          refCountDecrement();
        });

      return promise;
    });
  });
}
