export * from '@trpc/client';

export { getQueryKey, getMutationKey } from './internals/getQueryKey';
export {
  createTRPCReact,
  type CreateTRPCReact,
  type CreateTRPCReactBase,
} from './createTRPCReact';
export type { inferReactQueryProcedureOptions } from './utils/inferReactQueryProcedure';
export { createTRPCQueryUtils } from './createTRPCQueryUtils';
