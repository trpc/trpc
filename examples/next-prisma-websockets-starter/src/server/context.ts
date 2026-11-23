import type { CreateWSSContextFnOptions } from '@trpc/server/adapters/ws';
import type { Session } from 'next-auth';
import { ServerResponse } from 'node:http';
import { getRequestAuthSession, getServerAuthSession } from './auth';

/**
 * @see https://trpc.io/docs/v11/context
 */
export interface Context {
  session: Session | null;
}

function logContext(ctx: Context) {
  console.log('createContext for', ctx.session?.user?.name ?? 'unknown user');
  return ctx;
}

/**
 * Creates context for a WebSocket connection
 */
export const createContext = async (
  opts: CreateWSSContextFnOptions,
): Promise<Context> => {
  /**
   * `getServerSession` writes refreshed session cookies to the response, but a
   * WebSocket connection has no HTTP response to write to, so they go to a
   * detached one and are dropped.
   */
  const res = new ServerResponse(opts.req);

  return logContext({ session: await getServerAuthSession(opts.req, res) });
};

/**
 * Creates context for the request a server component or route handler is
 * handling
 * @see https://trpc.io/docs/client/nextjs/app-router-setup#2-create-a-trpc-router
 */
export const createRequestContext = async (): Promise<Context> =>
  logContext({ session: await getRequestAuthSession() });
