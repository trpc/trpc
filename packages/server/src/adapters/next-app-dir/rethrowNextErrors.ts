import * as nextNavigation from 'next/navigation';
import type { TRPCError } from '../../@trpc/server';
import { TRPCRedirectError } from './redirect';

/**
 * @remarks The helpers from `next/dist/client/components/*` has been removed in Next.js 15.
 * Inlining them here instead...
 */
const REDIRECT_ERROR_CODE = 'NEXT_REDIRECT';
function isRedirectError(error: unknown) {
  if (
    typeof error !== 'object' ||
    error === null ||
    !('digest' in error) ||
    typeof error.digest !== 'string'
  ) {
    return false;
  }
  const [errorCode, type, destination, status] = error.digest.split(';', 4);
  const statusCode = Number(status);
  return (
    errorCode === REDIRECT_ERROR_CODE &&
    (type === 'replace' || type === 'push') &&
    typeof destination === 'string' &&
    !isNaN(statusCode)
  );
}

const NOT_FOUND_ERROR_CODE = 'NEXT_NOT_FOUND';
function isNotFoundError(error: unknown) {
  if (typeof error !== 'object' || error === null || !('digest' in error)) {
    return false;
  }
  return error.digest === NOT_FOUND_ERROR_CODE;
}

/**
 * Rethrow errors that should be handled by Next.js
 */
export const rethrowNextErrors = (error: TRPCError) => {
  if (error.code === 'NOT_FOUND') {
    nextNavigation.notFound();
  }
  if (error instanceof TRPCRedirectError) {
    nextNavigation.redirect(...error.args);
  }
  const { cause } = error;

  // Next.js 15 has `unstable_rethrow`. Use that if it exists.
  if (
    'unstable_rethrow' in nextNavigation &&
    typeof nextNavigation.unstable_rethrow === 'function'
  ) {
    nextNavigation.unstable_rethrow(cause);
  }

  // Before Next.js 15, we have to check and rethrow the error manually.
  if (isRedirectError(cause) || isNotFoundError(cause)) {
    throw error.cause;
  }
};
