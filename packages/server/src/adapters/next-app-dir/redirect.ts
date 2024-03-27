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
 * @public
 */
export const redirect = (url: URL | string, redirectType?: RedirectType) => {
  return new TRPCRedirectError(url, redirectType);
};
