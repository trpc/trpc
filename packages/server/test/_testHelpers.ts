/* eslint-disable @typescript-eslint/no-explicit-any */
import '@testing-library/jest-dom';
import { createTRPCClient } from '@trpc/client';
import AbortController from 'abort-controller';
import fetch from 'node-fetch';
import { AnyRouter } from '../src';
import { createHttpServer } from '../src/adapters/standalone';

export async function expectError<TPromise extends Promise<any>>(
  promise: TPromise,
) {
  try {
    await promise;
    throw new Error('Did not throw');
  } catch (err) {
    return err;
  }
}
export function routerToServerAndClient<TRouter extends AnyRouter>(
  router: TRouter,
) {
  const server = createHttpServer({
    router,
    createContext: () => ({}),
  });
  const { port } = server.listen(0);

  const client = createTRPCClient<typeof router>({
    url: `http://localhost:${port}`,
    fetchOpts: {
      AbortController: AbortController as any,
      fetch: fetch as any,
    },
  });

  return {
    client,
    close: () => server.server.close(),
  };
}
