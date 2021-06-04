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
import { AppRouter, appRouter } from 'routers/appRouter';

export async function createTestRouter(opts: {
  createContext: CreateHttpContextFn<AppRouter>;
  server?: Partial<CreateHttpHandlerOptions<AppRouter>>;
  client?: Partial<CreateTRPCClientOptions<AppRouter>>;
}) {
  const server = createHttpServer({
    router: appRouter,
    createContext: opts.createContext,
    ...(opts?.server ?? {}),
  });

  const port = await new Promise<number>((resolve, reject) => {
    server.server.listen(0, () => {
      const address = server.server.address();
      if (address && typeof address !== 'string') {
        resolve(address.port);
      } else {
        reject();
      }
    });
  });

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
    close: () => {
      return new Promise<void>((resolve, reject) => {
        server.server.close((err) => {
          err ? reject(err) : resolve();
        });
      });
    },
    appRouter,
  };
}
