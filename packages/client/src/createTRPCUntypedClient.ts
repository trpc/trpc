import { AnyRouter } from '@trpc/server';
import {
  CreateTRPCClientOptions,
  TRPCUntypedClient,
} from './internals/TRPCUntypedClient';

export function createTRPCUntypedClient<TRouter extends AnyRouter>(
  opts: CreateTRPCClientOptions<TRouter>,
): TRPCUntypedClient<TRouter> {
  return new TRPCUntypedClient(opts);
}

export type {
  CreateTRPCClientOptions,
  TRPCRequestOptions,
} from './internals/TRPCUntypedClient';
export { TRPCUntypedClient } from './internals/TRPCUntypedClient';
