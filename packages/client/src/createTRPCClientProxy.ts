/* eslint-disable @typescript-eslint/no-non-null-assertion */

/* eslint-disable @typescript-eslint/no-explicit-any */
import type { AnyRouter } from '@trpc/server';
import { createProxy } from '@trpc/server/shared';
import { TRPCClient as Client } from './internals/TRPCClient';

/**
 * @internal
 */
export type FlattenRouter<TRouter extends AnyRouter> = {
  [Key in keyof TRouter['_def']['record']]: TRouter['_def']['record'][Key] extends AnyRouter
    ? FlattenRouter<TRouter['_def']['record'][Key]>
    : TRouter['_def']['record'][Key];
};

export function createTRPCClientProxy<TRouter extends AnyRouter>(
  client: Client<TRouter>,
) {
  const proxy = createProxy(({ path, args }) => {
    const pathCopy = [...path];
    let type = pathCopy.pop()!;
    if (type === 'mutate') {
      type = 'mutation';
    }
    const fullPath = pathCopy.join('.');
    return (client as any)[type](fullPath, ...args);
  });
  return proxy as FlattenRouter<TRouter>;
}
