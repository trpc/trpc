import type { RedirectType } from 'next/navigation.js';
import { TRPCError } from '../../@trpc/server';

/**
 * The error `redirect()` returns, which `nextAppDirCaller` turns into a
 * Next.js redirect.
 * @internal
 */
export class TRPCRedirectError extends TRPCError {
  public readonly args;
  constructor(url: URL | string, redirectType?: RedirectType) {
    super({
      // TODO(?): This should maybe a custom error code
      code: 'UNPROCESSABLE_CONTENT',
      message: `Redirect error to "${url}" that will be handled by Next.js`,
    });

    this.args = [url.toString(), redirectType] as const;
  }
}

/**
 * Like `redirect()` from `next/navigation`, for procedures called through
 * `nextAppDirCaller`. Return it from a resolver; the caller then
 * redirects. Its type is `undefined`, which matches what the client gets,
 * unlike Next.js's `never`.
 * @public
 */
export const redirect = (url: URL | string, redirectType?: RedirectType) => {
  // We rethrow this internally so the returntype on the client is undefined.
  return new TRPCRedirectError(url, redirectType) as unknown as undefined;
};
