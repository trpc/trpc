import { AnyRouter } from '@trpc/server';
import { createQueryUtils } from './shared';
import {
  CreateQueryUtilsOptions,
  createUtilityFunctions,
} from './utils/createUtilityFunctions';

export function createTRPCQueryUtils<TRouter extends AnyRouter>(
  opts: CreateQueryUtilsOptions<TRouter>,
) {
  const utils = createUtilityFunctions(opts);
  return createQueryUtils<TRouter>(utils);
}
