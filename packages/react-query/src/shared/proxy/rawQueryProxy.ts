import { useQueries } from '@tanstack/react-query';
import { createRecursiveProxy } from '@trpc/server/shared';
import { getQueryKey } from '../../internals/getQueryKey';

/**
 * Create proxy for raw queries
 * @internal
 */
export function createRawQueryProxy(name: string) {
  return createRecursiveProxy((opts) => {
    const args = opts.args;

    const pathCopy = [name, ...opts.path];

    // The `path` ends up being something like `post.byId`
    const path = pathCopy.join('.');
    const [queriesCallback, ...rest] = args;

    const queryKey = getQueryKey(path, input);

    return useQueries({
      queries: [],
    });
  });
}
