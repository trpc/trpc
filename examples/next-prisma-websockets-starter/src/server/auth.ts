import { parseCookie } from 'cookie';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { getServerSession } from 'next-auth/next';

/**
 * Imported lazily: `auth-options.ts` throws on load without GitHub
 * credentials, and `next build` loads the route handlers that read the session
 * while collecting page data.
 */
const loadAuthOptions = async () =>
  (await import('./auth-options')).authOptions;

/**
 * The session of a WebSocket connection, from its upgrade request.
 *
 * Reads the session with the server-side `getServerSession` rather than the
 * client-side `getSession`, which would make an internal HTTP request to
 * `/api/auth/session` on every call, log `CLIENT_FETCH_ERROR` and lose the
 * session when it fails.
 * @see https://github.com/trpc/trpc/issues/5602
 */
export async function getServerAuthSession(
  req: IncomingMessage & { cookies?: Partial<Record<string, string>> },
  res: ServerResponse,
) {
  /**
   * The WebSocket transport gives us the raw `IncomingMessage`.
   * `getServerSession` reads `req.cookies`, so it has to be populated here or
   * the session is silently lost.
   */
  const reqWithCookies = Object.assign(req, {
    cookies: req.cookies ?? parseCookie(req.headers.cookie ?? ''),
  });

  return getServerSession(reqWithCookies, res, await loadAuthOptions());
}

/**
 * The session of the request a server component or route handler is
 * handling. `getServerSession` reads it from `next/headers`.
 */
export async function getRequestAuthSession() {
  return getServerSession(await loadAuthOptions());
}
