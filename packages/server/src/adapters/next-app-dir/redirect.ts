import type { redirect as __redirect } from 'next/navigation';
import { TRPCError } from '../../@trpc/server';

/**
 * @internal
 */
export class TRPCRedirectError extends TRPCError {
  public readonly args;
  constructor(...args: Parameters<typeof __redirect>) {
    const [url] = args;
    super({
      // TODO(?): This should maybe a custom error code
      code: 'UNPROCESSABLE_CONTENT',
      message: `Redirect error to "${url}" that will be handled by Next.js`,
    });

    this.args = args;
  }
}

/**
 * Like `next/navigation`'s `redirect()` but throws a `TRPCError` that later will be handled by Next.js
 * @public
 */
export const redirect: typeof __redirect = (...args) => {
  throw new TRPCRedirectError(...args);
};
