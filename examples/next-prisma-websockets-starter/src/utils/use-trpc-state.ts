import type { DehydratedState } from '@tanstack/react-query';
import { useMemo } from 'react';
import superjson from 'superjson';

export type TRPCState = ReturnType<typeof superjson.serialize>;

/**
 * Reads back the `trpcState` a page returns from `getServerSideProps`, which
 * went through superjson so that `Date`s survive.
 * @see https://trpc.io/docs/client/nextjs/pages-router/setup#using-a-data-transformer
 */
export function useTRPCState(trpcState: TRPCState | undefined) {
  return useMemo(
    () => trpcState && superjson.deserialize<DehydratedState>(trpcState),
    [trpcState],
  );
}
