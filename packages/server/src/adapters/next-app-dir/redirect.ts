import type { redirect as nextRedirect } from 'next/navigation.js';
import { TRPCError } from '../../@trpc/server';

/**
 * Taken from `redirect()`'s signature: Next 15 exports `RedirectType` as an
 * enum, Next 16 only as a value, typed `'push' | 'replace'`.
 */
type RedirectType = NonNullable<Parameters<typeof nextRedirect>[1]>;

/**
 * The error `redirect()` returns, which `nextAppDirCaller` turns into a
 * Next.js redirect.
 * @internal
 */
export class TRPCRedirectError extends TRPCError {
  public readonly args;
  constructor(opts: {
    url: URL | string;
    /** Passed to Next.js `redirect()` unchanged; `undefined` lets Next.js pick the default. */
    redirectType: RedirectType | undefined;
  }) {
    super({
      // TODO(?): This should maybe a custom error code
      code: 'UNPROCESSABLE_CONTENT',
      message: `Redirect error to "${opts.url}" that will be handled by Next.js`,
    });

    this.args = [opts.url.toString(), opts.redirectType] as const;
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
  return new TRPCRedirectError({ url, redirectType }) as unknown as undefined;
};
