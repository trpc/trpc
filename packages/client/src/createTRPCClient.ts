/* eslint-disable @typescript-eslint/no-explicit-any */
import type { AnyRouter } from '@trpc/server';
import {
  TRPCClient as Client,
  CreateTRPCClientOptions,
} from './internals/TRPCClient';

export function createTRPCClient<TRouter extends AnyRouter>(
  opts: CreateTRPCClientOptions<TRouter>,
) {
  return new Client<TRouter>(opts);
}

export type { CreateTRPCClientOptions } from './internals/TRPCClient';

export type TRPCClient<TRouter extends AnyRouter> = Client<TRouter>;

export type { TRPCRequestOptions } from './internals/TRPCClient';
