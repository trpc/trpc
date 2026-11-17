import NextAuth from 'next-auth';
import type { NextRequest } from 'next/server';

/**
 * @see https://next-auth.js.org/configuration/initialization#route-handlers-app
 */
async function handler(
  req: NextRequest,
  context: { params: Promise<{ nextauth: string[] }> },
): Promise<Response> {
  /**
   * Imported lazily: `auth-options.ts` throws on load without GitHub
   * credentials, and `next build` loads this module while collecting page data
   */
  const { authOptions } = await import('~/server/auth-options');

  return NextAuth(req, context, authOptions);
}

export { handler as GET, handler as POST };
