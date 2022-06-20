/* eslint-disable @typescript-eslint/no-explicit-any */
import type { AnyRouter } from '@trpc/server';
import {
  TRPCClient as Client,
  CreateTRPCClientOptions,
} from './internals/TRPCClient';

export function createTRPCClient<TRouter extends AnyRouter>(
  opts: CreateTRPCClientOptions<TRouter>,
) {
  // Here we need to wrap the client in a Proxy to be able to call deep objects and translate them to `client.query` calls
  // And then for instance a call to `client.child.grandchild.queries.foo` should translate to `client.query('child.grandchild.foo')`
  return new Client<TRouter>(opts);
}

export type {
  TRPCRequestOptions,
  CreateTRPCClientOptions,
  TRPCClient,
} from './internals/TRPCClient';
