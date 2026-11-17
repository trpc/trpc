import type { IncomingMessage } from 'node:http';
import { ServerResponse } from 'node:http';
import type { WebSocket } from 'ws';
import { getServerAuthSession } from './auth';

/**
 * Creates context for an incoming request: from the API handler, a WebSocket
 * connection, or a page's `getServerSideProps`
 * @see https://trpc.io/docs/v11/context
 * @see https://trpc.io/docs/client/nextjs/pages-router/ssr#build-the-context-from-the-request
 */
export const createContext = async (opts: {
  req: IncomingMessage;
  res: ServerResponse | WebSocket;
}) => {
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
