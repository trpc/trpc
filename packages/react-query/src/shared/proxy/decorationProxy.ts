import { AnyRouter } from '@trpc/server';
import { createRecursiveProxy } from '@trpc/server/shared';
import { getQueryKey } from '../../internals/getQueryKey';
import { CreateReactQueryHooks } from '../hooks/createHooksInternal';

/**
 * Create proxy for decorating procedures
 * @internal
 */
export function createReactProxyDecoration<
  TRouter extends AnyRouter,
  TSSRContext = unknown,
>(name: string, hooks: CreateReactQueryHooks<TRouter, TSSRContext>) {
  return createRecursiveProxy(({ path, args }) => {
    const pathCopy = [name, ...path];

    // The last arg is for instance `.useMutation` or `.useQuery()`
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const lastArg = pathCopy.pop()!;

    if (lastArg === 'useMutation') {
      return (hooks as any)[lastArg](pathCopy, ...args);
    }
    const [input, ...rest] = args;

    // Expose queryKey helper
    if (lastArg === 'getQueryKey') {
      return getQueryKey(pathCopy, input, (rest[0] as any) ?? 'any');
    }

    const opts = rest[0] || {};
    if (lastArg.startsWith('useSuspense')) {
      const fn =
        lastArg === 'useSuspenseQuery' ? 'useQuery' : 'useInfiniteQuery';
      const result = (hooks as any)[fn](pathCopy, input, {
        ...opts,
        suspense: true,
        enabled: true,
      });
      return [result.data, result];
    }
    return (hooks as any)[lastArg](pathCopy, input, opts);
  });
}
