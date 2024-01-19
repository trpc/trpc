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
   * @deprecated - use `CreateTRPCClient` instead
   */
  type CreateTRPCClient as CreateTRPCProxyClient,
  /**
   * @deprecated - use `inferRouterClient` instead
   */
  type inferRouterClient as inferRouterProxyClient,
} from './createTRPCClient';
