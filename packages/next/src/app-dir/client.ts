import {
  clientCallTypeToProcedureType,
  createTRPCUntypedClient,
} from '@trpc/client';
import { AnyRouter } from '@trpc/server';
import { createRecursiveProxy } from '@trpc/server/shared';
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

// ts-prune-ignore-next
export function experimental_createTRPCNextAppDirClient<
  TRouter extends AnyRouter,
>(opts: CreateTRPCNextAppRouterOptions<TRouter>) {
  const client = createTRPCUntypedClient<TRouter>(opts.config());
  // const useProxy = createUseProxy<TRouter>(client);

  const cache = new Map<string, QueryResult>();
  // return createFlatProxy<CreateTRPCNextAppRouter<TRouter>>((key) => {
  // if (key === 'use') {
  //   return (
  //     cb: (
  //       t: UseProcedureRecord<TRouter>,
  //     ) => Promise<unknown> | Promise<unknown>[],
  //   ) => {
  //     const promise = normalizePromiseArray(cb(useProxy));
  //     throw promise;
  //     // const [data, setData] = useState<unknown | unknown[]>();

  //     // useEffect(() => {
  //     //   const promise = normalizePromiseArray(cb(useProxy));

  //     //   void promise.then(setData).catch((err) => {
  //     //     throw err;
  //     //   });
  //     //   // eslint-disable-next-line react-hooks/exhaustive-deps
  //     // }, []);

  //     // return data;
  //   };
  // }

  return createRecursiveProxy(({ path, args }) => {
    // const pathCopy = [key, ...path];
    const pathCopy = [...path];
    const action = pathCopy.pop() as string;

    const fullPath = pathCopy.join('.');
    const procedureType = clientCallTypeToProcedureType(action);
    const cacheTag = generateCacheTag(fullPath, args[0]);

    if (action === 'revalidate') {
      // invalidate client cache
      cache.delete(cacheTag);

      // invaldiate server cache
      void fetch('/api/trpc/revalidate', {
        method: 'POST',
        body: JSON.stringify({
          cacheTag,
        }),
      });

      return;
    }

    if (procedureType === 'query') {
      const cached = cache.get(cacheTag);

      if (cached?.promise) {
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

    cache.set(cacheTag, { promise });

    return promise;
  }) as NextAppDirDecoratedProcedureRecord<TRouter['_def']['record']>;
  // });
}
