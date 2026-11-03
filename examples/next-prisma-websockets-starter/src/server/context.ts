import type { CreateNextContextOptions } from '@trpc/server/adapters/next';
import type { CreateWSSContextFnOptions } from '@trpc/server/adapters/ws';
import { ServerResponse } from 'node:http';
import { getServerAuthSession } from './auth';

/**
 * Creates context for an incoming request
 * @see https://trpc.io/docs/v11/context
 */
export const createContext = async (
  opts: CreateNextContextOptions | CreateWSSContextFnOptions,
) => {
  /**
   * `getServerSession` writes refreshed session cookies to the response, but a
   * WebSocket connection has no HTTP response to write to, so they go to a
   * detached one and are dropped.
   */
  const res = 'setHeader' in opts.res ? opts.res : new ServerResponse(opts.req);

  const session = await getServerAuthSession(opts.req, res);

  console.log('createContext for', session?.user?.name ?? 'unknown user');

  return {
    session,
  };
};

export type Context = Awaited<ReturnType<typeof createContext>>;
