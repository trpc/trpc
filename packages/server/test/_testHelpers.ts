/* eslint-disable @typescript-eslint/ban-types */
/* eslint-disable @typescript-eslint/no-explicit-any */
import AbortController from 'abort-controller';
import fetch from 'node-fetch';
import { createTRPCClient, CreateTRPCClientOptions } from '../../client/src';
import { AnyRouter, CreateHttpHandlerOptions } from '../src';
import { createHttpServer } from '../src/adapters/standalone';

export function routerToServerAndClient<TRouter extends AnyRouter>(
  router: TRouter,
  opts?: {
    server?: Partial<CreateHttpHandlerOptions<TRouter>>;
    client?: Partial<CreateTRPCClientOptions<TRouter>>;
  },
) {
  const server = createHttpServer({
    router,
    createContext: () => ({}),
    ...(opts?.server ?? {}),
  });
  const { port } = server.listen(0);

  const client = createTRPCClient<typeof router>({
    url: `http://localhost:${port}`,
    fetchOpts: {
      AbortController: AbortController as any,
      fetch: fetch as any,
    },
    ...(opts?.client ?? {}),
  });

  return {
    client,
    close: () => server.server.close(),
    router,
  };
}
