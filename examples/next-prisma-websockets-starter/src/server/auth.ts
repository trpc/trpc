import { parseCookie } from 'cookie';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { getServerSession } from 'next-auth/next';

/**
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
   * Imported lazily: `[...nextauth].ts` throws on load without GitHub
   * credentials, and `next build` loads this module through
   * `app/api/trpc-ws/route.ts` while collecting page data.
   */
  const { authOptions } = await import('../pages/api/auth/[...nextauth]');

  /**
   * Next.js parses cookies for API routes, but the WebSocket transport gives us
   * the raw `IncomingMessage`. `getServerSession` reads `req.cookies`, so it has
   * to be populated here or the session is silently lost.
   */
  const reqWithCookies = Object.assign(req, {
    cookies: req.cookies ?? parseCookie(req.headers.cookie ?? ''),
  });

  return getServerSession(reqWithCookies, res, authOptions);
}
