import type { AnyRouter } from '@trpc/server/unstable-core-do-not-import';
import { createRecursiveProxy } from '@trpc/server/unstable-core-do-not-import';
import type { CreateReactQueryHooks } from '../hooks/createHooksInternal';

/**
 * Create proxy for decorating procedures
 * @internal
 */
export function createReactDecoration<
  TRouter extends AnyRouter,
  TSSRContext = unknown,
>(hooks: CreateReactQueryHooks<TRouter, TSSRContext>) {
  return createRecursiveProxy(({ path, args }) => {
    const pathCopy = [...path];

    // The last arg is for instance `.useMutation` or `.useQuery()`
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const lastArg = pathCopy.pop()!;

    if (lastArg === 'useMutation') {
      return (hooks as any)[lastArg](pathCopy, ...args);
    }

    if (lastArg === '_def') {
      return {
        path: pathCopy,
      };
    }

    const [input, ...rest] = args;
    const opts = rest[0] ?? {};

    return (hooks as any)[lastArg](pathCopy, input, opts);
  });
}
