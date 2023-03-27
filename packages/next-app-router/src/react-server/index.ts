import {
  CreateTRPCProxyClient,
  TRPCUntypedClient,
  clientCallTypeToProcedureType,
} from '@trpc/client';
import { AnyRouter } from '@trpc/server';
import { createRecursiveProxy } from '@trpc/server/shared';

type CreateTRPCNextAppRouterReactServerOptions<TRouter extends AnyRouter> = {
  getClient: () => TRPCUntypedClient<TRouter>;
};

export function createTRPCNextAppRouterReactServer<TRouter extends AnyRouter>(
  opts: CreateTRPCNextAppRouterReactServerOptions<TRouter>,
) {
  return createRecursiveProxy(({ path, args }) => {
    // lazily initialize client, presumably this function is wrapped in cache()
    const client = opts.getClient();

    const pathCopy = [...path];
    const procedureType = clientCallTypeToProcedureType(
      pathCopy.pop() as string,
    );
    const fullPath = pathCopy.join('.');

    return (client as any)[procedureType](fullPath, ...args);
  }) as CreateTRPCProxyClient<TRouter>;
}
