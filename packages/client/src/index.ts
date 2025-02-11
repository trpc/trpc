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

export { type TRPCProcedureOptions } from './internals/types';
