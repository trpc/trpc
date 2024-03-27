import { isNotFoundError } from 'next/dist/client/components/not-found';
import { isRedirectError } from 'next/dist/client/components/redirect';
import {
  notFound as __notFound,
  redirect as __redirect,
} from 'next/navigation';
import { TRPCError } from '../../@trpc/server';

/**
 * Rethrow errors that should be handled by Next.js
 */
export const rethrowNextErrors = (error: TRPCError) => {
  if (error.code === 'NOT_FOUND') {
    __notFound();
  }
  if (error instanceof TRPCRedirectError) {
    __redirect(...error.args);
  }
  const { cause } = error;
  if (isRedirectError(cause) || isNotFoundError(cause)) {
    throw error.cause;
  }
};

class TRPCRedirectError extends TRPCError {
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

/**
 * Like `next/navigation`'s `notFound()` but throws a `TRPCError` that later will be handled by Next.js
 * @public
 */
export const notFound: typeof __notFound = () => {
  throw new TRPCError({
    code: 'NOT_FOUND',
  });
};
