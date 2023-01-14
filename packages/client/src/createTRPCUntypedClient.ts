import { AnyRouter } from '@trpc/server';
import {
  CreateTRPCClientOptions,
  TRPCUntypedClient,
} from './internals/TRPCUntypedClient';

export function createTRPCUntypedClient<TRouter extends AnyRouter>(
  opts: CreateTRPCClientOptions<TRouter>,
) {
  const client = new TRPCUntypedClient(opts);
  return client;
}

export type {
  CreateTRPCClientOptions,
  TRPCRequestOptions,
  TRPCUntypedClient,
} from './internals/TRPCUntypedClient';
