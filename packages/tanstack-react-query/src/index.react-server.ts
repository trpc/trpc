// The build for the `react-server` export condition. It lists its values
// instead of `export * from './index'` so the modules that use React's
// client-only APIs stay out of it (#6595)
export type * from './index';
export { createTRPCOptionsProxy } from './internals/createOptionsProxy';
export { createHydrateClientReactServer as unstable_createHydrateClient } from './internals/HydrateClient';
export {
  createTRPCContextReactServer as createTRPCContext,
  useSubscriptionReactServer as useSubscription,
} from './internals/clientOnly';
