import type { notFound as __notFound } from 'next/navigation';
import { TRPCError } from '../../@trpc/server';

/**
 * Like `next/navigation`'s `notFound()` but throws a `TRPCError` that later will be handled by Next.js
 * @public
 */
export const notFound: typeof __notFound = () => {
  throw new TRPCError({
    code: 'NOT_FOUND',
  });
};
