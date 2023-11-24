export * from './createTRPCUntypedClient';
export * from './createTRPCClient';

export { TRPCClientError, type TRPCClientErrorLike } from './TRPCClientError';
export * from './links/index';

export {
  createTRPCClient,
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
