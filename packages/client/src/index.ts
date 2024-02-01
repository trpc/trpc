// TODO: Be explicit about what we export here

export * from './unstable-internals';

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
} from './unstable-internals';
