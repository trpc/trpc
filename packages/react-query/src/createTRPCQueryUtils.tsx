import type { AnyRouter } from '@trpc/server/unstable-core-do-not-import';
import { createQueryUtilsProxy } from './shared';
import type { CreateQueryUtilsOptions } from './utils/createUtilityFunctions';
import { createUtilityFunctions } from './utils/createUtilityFunctions';

/**
 * Creates the `useUtils` helpers outside of React, from a tRPC client and a
 * `QueryClient`.
 *
 * @deprecated `@trpc/react-query` only gets bug fixes and will be removed in
 * the next major version. Use `@trpc/tanstack-react-query` instead.
 * @see https://trpc.io/docs/client/tanstack-react-query/migrating
 * @see https://trpc.io/docs/client/react/createTRPCQueryUtils
 */
export function createTRPCQueryUtils<TRouter extends AnyRouter>(
  opts: CreateQueryUtilsOptions<TRouter>,
) {
  const utils = createUtilityFunctions(opts);
  return createQueryUtilsProxy<TRouter>(utils);
}
