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

export type {
  TRPCRequestOptions,
  CreateTRPCClientOptions,
  TRPCClient,
} from './internals/TRPCClient';
