import type { AnyTRPCRouter } from '@trpc/server';
import type {
  TRPCOptionsProxy,
  TRPCOptionsProxyOptions,
} from './internals/createOptionsProxy';
import {
  createTRPCOptionsProxy as createTRPCOptionsProxyInternal,
  reactServerProxy,
} from './internals/createOptionsProxy';
import type { DefaultFeatureFlags, FeatureFlags } from './internals/types';

export * from './index';
export { createHydrateClientReactServer as unstable_createHydrateClient } from './internals/HydrateClient';

/**
 * Create a typed proxy from your router types. Can also be used on the server.
 *
 * @see https://trpc.io/docs/client/tanstack-react-query/setup#3c-set-up-without-react-context
 * @see https://trpc.io/docs/client/tanstack-react-query/server-components#5-create-a-trpc-caller-for-server-components
 */
export function createTRPCOptionsProxy<
  TRouter extends AnyTRPCRouter,
  TFeatureFlags extends FeatureFlags = DefaultFeatureFlags,
>(
  opts: TRPCOptionsProxyOptions<TRouter, TFeatureFlags>,
): TRPCOptionsProxy<TRouter, TFeatureFlags> {
  return createTRPCOptionsProxyInternal(
    Object.assign({}, opts, { [reactServerProxy]: true }),
  );
}
