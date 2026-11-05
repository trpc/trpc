import type { AnyRouter } from '@trpc/server/unstable-core-do-not-import';
import type { CreateTRPCClientOptions } from './internals/TRPCUntypedClient';
import { TRPCUntypedClient } from './internals/TRPCUntypedClient';

/**
 * Creates a client that calls procedures by path string, without types.
 * Meant for libraries built on tRPC; apps should use `createTRPCClient`.
 */
export function createTRPCUntypedClient<TRouter extends AnyRouter>(
  opts: CreateTRPCClientOptions<TRouter>,
): TRPCUntypedClient<TRouter> {
  return new TRPCUntypedClient(opts);
}

export type {
  CreateTRPCClientOptions,
  SubscriptionEvent,
  TRPCRequestOptions,
} from './internals/TRPCUntypedClient';
export { TRPCUntypedClient } from './internals/TRPCUntypedClient';
