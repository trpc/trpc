import type { RedirectType } from 'next/navigation';
import { TRPCError } from '../../@trpc/server';

/**
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
 * Like `next/navigation`'s `redirect()` but throws a `TRPCError` that later will be handled by Next.js
 * This provides better typesafety than the `next/navigation`'s `redirect()` since the action continues
 * to execute on the frontend even if Next's `redirect()` has a return type of `never`.
 * @public
 * @remark You should only use this if you're also using `nextAppDirCaller`.
 */
export const redirect = (url: URL | string, redirectType?: RedirectType) => {
  // We rethrow this internally so the returntype on the client is undefined.
  return new TRPCRedirectError(url, redirectType) as unknown as undefined;
};
