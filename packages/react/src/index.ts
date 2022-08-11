export * from '@trpc/client';

export { createReactQueryHooks } from './createReactQueryHooks';
export {
  createReactQueryHooksProxy,
  createTRPCReact,
} from './createReactQueryHooksProxy';
export type { DecoratedProcedureUtilsRecord } from './internals/utilsProxy';
export type { DecoratedProcedureRecord } from './createReactQueryHooksProxy';
