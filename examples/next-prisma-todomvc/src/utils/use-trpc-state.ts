import type { DehydratedState } from '@tanstack/react-query';
import { useMemo } from 'react';
import superjson from 'superjson';

/**
 * `getStaticProps` runs the dehydrated cache through superjson, so the tasks'
 * `createdAt` reach the page as a `Date`.
 * @see https://trpc.io/docs/client/nextjs/pages-router/setup#using-a-data-transformer
 */
export type TRPCState = ReturnType<typeof superjson.serialize>;

export function useTRPCState(trpcState: TRPCState | undefined) {
  return useMemo(
    () => trpcState && superjson.deserialize<DehydratedState>(trpcState),
    [trpcState],
  );
}
