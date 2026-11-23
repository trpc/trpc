import type { notFound as __notFound } from 'next/navigation.js';
import { TRPCError } from '../../@trpc/server';

/**
 * Like `notFound()` from `next/navigation`, but throws a `NOT_FOUND`
 * `TRPCError`, which `nextAppDirCaller` turns into Next.js's not-found
 * page.
 * @public
 */
export const notFound: typeof __notFound = () => {
  throw new TRPCError({
    code: 'NOT_FOUND',
  });
};
