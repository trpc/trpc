export * from '@trpc/client';

export { getQueryKey } from './internals/getQueryKey';
export { createTRPCReact, type CreateTRPCReact } from './createTRPCReact';
export { createReactQueryHooks } from './interop';
export type { inferReactQueryProcedureOptions } from './utils/inferReactQueryProcedure';
