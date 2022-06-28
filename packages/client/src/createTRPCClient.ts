/* eslint-disable @typescript-eslint/no-non-null-assertion */

/* eslint-disable @typescript-eslint/no-explicit-any */
import type { AnyRouter } from '@trpc/server';
import {
  TRPCClient as Client,
  CreateTRPCClientOptions,
} from './internals/TRPCClient';

export type EnsureRecord<T> = T extends Record<string, any>
  ? T
  : Record<string, never>;

type FlattenRouter<TRouter extends AnyRouter> = {
  [Key in keyof TRouter['_def']['procedures']]: TRouter['_def']['procedures'][Key] extends AnyRouter
    ? FlattenRouter<TRouter['_def']['procedures'][Key]>
    : TRouter['_def']['procedures'][Key];
};

function makeProxy<TRouter extends AnyRouter>(
  client: Client<TRouter>,
  ...path: string[]
) {
  const proxy: any = new Proxy(
    function () {
      // noop
    },
    {
      get(_obj, name) {
        if (name in client && !path.length) {
          return client[name as keyof typeof client];
        }
        if (typeof name === 'string') {
          return makeProxy(client, ...path, name);
        }

        return client;
      },
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      apply(_1, _2, args) {
        const pathCopy = [...path];
        let type = pathCopy.pop()!;
        if (type === 'mutate') {
          type = 'mutation';
        }
        const fullPath = pathCopy.join('.');

        if (type.startsWith('use')) {
          throw new Error(`Invalid hook call`);
        }

        return (client as any)[type](fullPath, ...args);
      },
    },
  );

  return proxy as typeof client & FlattenRouter<TRouter>;
}
export function createTRPCClient<TRouter extends AnyRouter>(
  opts: CreateTRPCClientOptions<TRouter>,
) {
  const client = new Client<TRouter>(opts);
  // Here we need to wrap the client in a Proxy to be able to call deep objects and translate them to `client.query`-calls
  return makeProxy(client);
}

// Also the client created above needs to somehow be like `TRPCClient<Router> & Omit<Router, 'createCaller' | 'createProcedure' | '_def' | 'transformer' | 'errorFormatter' | 'getErrorShape>`

export type {
  TRPCRequestOptions,
  CreateTRPCClientOptions,
  TRPCClient,
} from './internals/TRPCClient';
