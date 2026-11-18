// TODO: Be explicit about what we export here

export * from './createTRPCUntypedClient';
export * from './createTRPCClient';
export * from './getFetch';
export * from './TRPCClientError';
export * from './links';

export {
  /**
   * @deprecated - use `createTRPCClient` instead
   */
  createTRPCClient as createTRPCProxyClient,
  /**
   * @deprecated - use `inferRouterClient` instead
   */
  type inferRouterClient as inferRouterProxyClient,
} from './createTRPCClient';

export {
  experimental_nested,
  experimental_settle,
  type experimental_NestedQueries,
  type experimental_NestedShape,
  type experimental_Node,
  type experimental_Settled,
  type experimental_StandIn,
} from './nested';

export { type TRPCProcedureOptions } from './internals/types';

export {
  safe,
  type SafeResult,
  type TRPCTaggedPromise as TRPCPromise,
} from './safe';
