import type { AnyRouter } from '@trpc/server/unstable-core-do-not-import';
import { createQueryUtilsProxy } from './shared';
import type { CreateQueryUtilsOptions } from './utils/createUtilityFunctions';
import { createUtilityFunctions } from './utils/createUtilityFunctions';

export function createTRPCQueryUtils<TRouter extends AnyRouter>(
  opts: CreateQueryUtilsOptions<TRouter>,
) {
  const utils = createUtilityFunctions(opts);
  return createQueryUtilsProxy<TRouter>(utils);
}
