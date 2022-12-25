export * from './proxy/decorationProxy';
export * from './proxy/utilsProxy';
export * from './proxy/useQueriesProxy';
export type {
  DecoratedProcedureRecord,
  DecorateProcedure,
} from '../createTRPCReact';
export type { TRPCUseQueries } from '../internals/useQueries';
export * from './hooks/createHooksInternal';
export * from './queryClient';
export * from './types';
export * from './hooks/types';

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
