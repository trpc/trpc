/// <reference types="next" />

import {
  CreateTRPCProxyClient,
  clientCallTypeToProcedureType,
  createTRPCUntypedClient,
} from '@trpc/client';
import { AnyRouter } from '@trpc/server';
import { createRecursiveProxy } from '@trpc/server/shared';
import { cache } from 'react';
import { CreateTRPCNextAppRouterOptions } from './shared';

// ts-prune-ignore-next
export function createTRPCNextAppRouterReactServer<TRouter extends AnyRouter>(
  opts: CreateTRPCNextAppRouterOptions<TRouter>,
) {
  const getClient = cache(() => {
    const config = opts.config();
    return createTRPCUntypedClient(config);
  });

  return createRecursiveProxy(({ path, args }) => {
    // lazily initialize client
    const client = getClient();

    const pathCopy = [...path];
    const procedureType = clientCallTypeToProcedureType(
      pathCopy.pop() as string,
    );
    const fullPath = pathCopy.join('.');

    return (client[procedureType] as any)(fullPath, ...args);
  }) as CreateTRPCProxyClient<TRouter>;
}
