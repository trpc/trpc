/* eslint-disable @typescript-eslint/no-explicit-any */
import type { AnyRouter } from '@trpc/server';
import {
  CreateTRPCClientOptions,
  TRPCClient as Client,
} from './internals/TRPCClient';

export function createTRPCClient<TRouter extends AnyRouter>(
  opts: CreateTRPCClientOptions<TRouter>,
) {
  return new Client<TRouter>(opts);
}

export type TRPCClient<TRouter extends AnyRouter> = Client<TRouter>;

export type {
  TRPCRequestOptions,
  CreateTRPCClientOptions,
} from './internals/TRPCClient';
