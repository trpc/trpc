import { AnyRouter } from '@trpc/server/unstableInternalsExport';
import { createQueryUtilsProxy } from './shared';
import {
  CreateQueryUtilsOptions,
  createUtilityFunctions,
} from './utils/createUtilityFunctions';

export function createTRPCQueryUtils<TRouter extends AnyRouter>(
  opts: CreateQueryUtilsOptions<TRouter>,
) {
  const utils = createUtilityFunctions(opts);
  return createQueryUtilsProxy<TRouter>(utils);
}
