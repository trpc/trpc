export * from './proxy/decorationProxy';
export * from './proxy/utilsProxy';
export * from './proxy/useQueriesProxy';
export type {
  DecorateRouterRecord,
  DecorateProcedure,
} from '../createTRPCReact';
export type {
  TRPCUseQueries,
  TRPCUseSuspenseQueries,
} from '../internals/useQueries';
export * from './hooks/createRootHooks';
export * from './queryClient';
export * from './types';
export * from './hooks/types';
export * from './polymorphism';

export {
  /**
   * @deprecated this is an internal function
   */
  getClientArgs,
} from '../internals/getClientArgs';

export {
  /**
   * @deprecated
   */
  TRPCContext,
} from './../internals/context';

export * from '../internals/context';
