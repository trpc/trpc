export * from '@trpc/client';

export { getQueryKey, getMutationKey } from './internals/getQueryKey';
export {
  createTRPCReact,
  type CreateTRPCReact,
  type CreateTRPCReactBase,
} from './createTRPCReact';
export type { inferReactQueryProcedureOptions } from './utils/inferReactQueryProcedure';
export type { DecorateRouterRecord } from './shared';
export { createTRPCQueryUtils } from './createTRPCQueryUtils';
