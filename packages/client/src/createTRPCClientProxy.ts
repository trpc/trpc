/* eslint-disable @typescript-eslint/no-non-null-assertion */

/* eslint-disable @typescript-eslint/no-explicit-any */
import type { AnyRouter } from '@trpc/server';
import { TRPCClient as Client } from './internals/TRPCClient';

type FlattenRouter<TRouter extends AnyRouter> = {
  [Key in keyof TRouter['_def']['record']]: TRouter['_def']['record'][Key] extends AnyRouter
    ? FlattenRouter<TRouter['_def']['record'][Key]>
    : TRouter['_def']['record'][Key];
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
export function createTRPCClientProxy<TRouter extends AnyRouter>(
  client: Client<TRouter>,
) {
  return makeProxy(client);
}
