/* eslint-disable @typescript-eslint/ban-types */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createTRPCClient, CreateTRPCClientOptions } from '@trpc/client';
import {
  CreateHttpContextFn,
  CreateHttpHandlerOptions,
  createHttpServer,
} from '@trpc/server';
import AbortController from 'abort-controller';
import fetch from 'node-fetch';
import { appRouter, AppRouter } from 'pages/api/trpc/[trpc]';

export function createTestRouter(opts: {
  createContext: CreateHttpContextFn<AppRouter>;
  server?: Partial<CreateHttpHandlerOptions<AppRouter>>;
  client?: Partial<CreateTRPCClientOptions<AppRouter>>;
}) {
  const server = createHttpServer({
    router: appRouter,
    createContext: opts.createContext,
    ...(opts?.server ?? {}),
  });
  const { port } = server.listen(0);

  return {
    client: (
      createClientOptions?: Partial<CreateTRPCClientOptions<AppRouter>>,
    ) =>
      createTRPCClient<AppRouter>({
        url: `http://localhost:${port}`,
        fetchOpts: {
          AbortController: AbortController as any,
          fetch: fetch as any,
        },
        ...(createClientOptions ?? {}),
      }),
    close: (done?: () => void) => server.server.close(done),
    appRouter,
  };
}
