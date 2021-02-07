/* eslint-disable @typescript-eslint/ban-types */
/* eslint-disable @typescript-eslint/no-explicit-any */
import '@testing-library/jest-dom';
import { createTRPCClient, CreateTRPCClientOptions } from '@trpc/client';
import AbortController from 'abort-controller';
import fetch from 'node-fetch';
import { AnyRouter } from '../src';
import {
  CreateHttpContextFn,
  createHttpServer,
} from '../src/adapters/standalone';

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
export function routerToServerAndClient<
  TRouter extends AnyRouter,
  TContext = {}
>(
  router: TRouter,
  opts?: {
    createContext?: CreateHttpContextFn<TContext>;
    getHeaders?: CreateTRPCClientOptions['getHeaders'];
  },
) {
  const server = createHttpServer({
    router,
    createContext: opts?.createContext ?? (() => ({})),
  });
  const { port } = server.listen(0);

  const client = createTRPCClient<typeof router>({
    url: `http://localhost:${port}`,
    fetchOpts: {
      AbortController: AbortController as any,
      fetch: fetch as any,
    },
    getHeaders: opts?.getHeaders,
  });

  return {
    client,
    close: () => server.server.close(),
  };
}
