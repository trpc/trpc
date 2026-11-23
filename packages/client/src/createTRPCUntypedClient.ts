import type { AnyRouter } from '@trpc/server/unstable-core-do-not-import';
import type { CreateTRPCClientOptions } from './TRPCUntypedClient';
import { TRPCUntypedClient } from './TRPCUntypedClient';

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
  TRPCRequestOptions,
} from './TRPCUntypedClient';
export { TRPCUntypedClient } from './TRPCUntypedClient';
