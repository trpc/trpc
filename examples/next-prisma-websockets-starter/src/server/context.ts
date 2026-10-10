import type { CreateNextContextOptions } from '@trpc/server/adapters/next';
import type { CreateWSSContextFnOptions } from '@trpc/server/adapters/ws';
import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../pages/api/auth/[...nextauth]';

/**
 * Parses a `Cookie` header the same way Next.js does for API routes, so the
 * WebSocket transport behaves identically to the HTTP transport.
 * @see https://github.com/trpc/trpc/issues/5602
 */
function parseCookies(header: string | undefined) {
  return Object.fromEntries(
    (header ?? '').split(';').flatMap((pair) => {
      const separator = pair.indexOf('=');
      if (separator === -1) return [];

      const name = pair.slice(0, separator).trim();
      if (!name) return [];

      const value = pair.slice(separator + 1).trim();
      try {
        return [[name, decodeURIComponent(value)]];
      } catch {
        return [[name, value]];
      }
    }),
  );
}

/**
 * `getServerSession` writes refreshed session cookies to the response, but a
 * WebSocket connection has no HTTP response to write to.
 */
const noopResponse = {
  getHeader: () => undefined,
  setHeader: () => undefined,
  setCookie: () => undefined,
} as unknown as NextApiResponse;

/**
 * Creates context for an incoming request
 * @see https://trpc.io/docs/v11/context
 */
export const createContext = async (
  opts: CreateNextContextOptions | CreateWSSContextFnOptions,
) => {
  const req = opts.req as NextApiRequest & {
    cookies?: Record<string, string>;
  };

  /**
   * Next.js parses cookies for API routes, but the WebSocket transport gives us
   * the raw `IncomingMessage`. `getServerSession` reads `req.cookies`, so it has
   * to be populated here or the session is silently lost.
   */
  req.cookies ??= parseCookies(req.headers.cookie);

  /**
   * Using the server-side `getServerSession` rather than the client-side
   * `getSession` avoids an internal HTTP request to `/api/auth/session` on
   * every call, which logs `CLIENT_FETCH_ERROR` and loses the session when it
   * fails.
   * @see https://github.com/trpc/trpc/issues/5602
   */
  const session = await getServerSession(
    req,
    'setHeader' in opts.res ? opts.res : noopResponse,
    authOptions,
  );

  console.log('createContext for', session?.user?.name ?? 'unknown user');

  return {
    session,
  };
};

export type Context = Awaited<ReturnType<typeof createContext>>;
