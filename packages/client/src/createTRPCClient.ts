/* eslint-disable @typescript-eslint/no-explicit-any */
import type { AnyRouter } from '@trpc/server';
import {
  TRPCClient as Client,
  CreateTRPCClientOptions,
} from './internals/TRPCClient';

export type EnsureRecord<T> = T extends Record<string, any>
  ? T
  : Record<string, never>;

type FlattenRouter<TRouter extends AnyRouter> = Pick<TRouter, 'queries'> & {
  [TKey in keyof TRouter['children']]: FlattenRouter<TRouter['children'][TKey]>;
};

export function createTRPCClient<TRouter extends AnyRouter>(
  opts: CreateTRPCClientOptions<TRouter>,
) {
  const client = new Client<TRouter>(opts);
  // Here we need to wrap the client in a Proxy to be able to call deep objects and translate them to `client.query` calls
  // And then for instance a call to `client.child.grandchild.queries.foo` should translate to `client.query('child.grandchild.foo')`
  // TODO wrap with Proxy
  return client as typeof client & FlattenRouter<TRouter>;
}

// Also the client created above needs to somehow be like `TRPCClient<Router> & Omit<Router, 'createCaller' | 'createProcedure' | '_def' | 'transformer' | 'errorFormatter' | 'getErrorShape>`

export type {
  TRPCRequestOptions,
  CreateTRPCClientOptions,
  TRPCClient,
} from './internals/TRPCClient';
