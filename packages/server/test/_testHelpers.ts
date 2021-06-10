/* eslint-disable @typescript-eslint/ban-types */
/* eslint-disable @typescript-eslint/no-explicit-any */
import AbortController from 'abort-controller';
import fetch from 'node-fetch';
import { createTRPCClient, CreateTRPCClientOptions } from '../../client/src';
import { AnyRouter, CreateHttpHandlerOptions } from '../src';
import { createHttpServer } from '../src/adapters/standalone';

(global as any).fetch = fetch;
(global as any).AbortController = AbortController;
export function routerToServerAndClient<TRouter extends AnyRouter>(
  router: TRouter,
  opts?: {
    server?: Partial<CreateHttpHandlerOptions<TRouter>>;
    client?:
      | Partial<CreateTRPCClientOptions<TRouter>>
      | ((opts: { url: string }) => Partial<CreateTRPCClientOptions<TRouter>>);
  },
) {
  const server = createHttpServer({
    router,
    createContext: () => ({}),
    ...(opts?.server ?? {}),
  });
  const { port } = server.listen(0);
  const url = `http://localhost:${port}`;
  const trpcClientOptions: CreateTRPCClientOptions<typeof router> = {
    url,
    ...(opts?.client
      ? typeof opts.client === 'function'
        ? opts.client({ url })
        : opts.client
      : {}),
  };

  const client = createTRPCClient<typeof router>(trpcClientOptions);

  return {
    client,
    close: () => server.server.close(),
    router,
    trpcClientOptions,
    port,
  };
}
