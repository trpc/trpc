import { isNotFoundError } from 'next/dist/client/components/not-found';
import { isRedirectError } from 'next/dist/client/components/redirect';
import type { TRPCError } from '../../@trpc/server';

/**
 * Rethrow errors that should be handled by Next.js
 */
export const rethrowNextErrors = (error: TRPCError) => {
  const { cause } = error;
  if (isRedirectError(cause) || isNotFoundError(cause)) {
    throw error.cause;
  }
};
