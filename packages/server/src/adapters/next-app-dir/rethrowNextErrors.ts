import { isNotFoundError } from 'next/dist/client/components/not-found';
import { isRedirectError } from 'next/dist/client/components/redirect';
import {
  notFound as __notFound,
  redirect as __redirect,
} from 'next/navigation';
import type { TRPCError } from '../../@trpc/server';
import { TRPCRedirectError } from './redirect';

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
