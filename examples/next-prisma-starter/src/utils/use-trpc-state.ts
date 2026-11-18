import type { DehydratedState } from '@tanstack/react-query';
import { useMemo } from 'react';
import { transformer } from './transformer';

export type TRPCState = ReturnType<typeof transformer.serialize>;

/**
 * Reads back the `trpcState` a page's `getStaticProps` or `getServerSideProps`
 * returns as `transformer.serialize(dehydrate(queryClient))`
 * @see https://trpc.io/docs/v11/client/nextjs/pages-router/setup#using-a-data-transformer
 */
export function useTRPCState(trpcState: TRPCState | undefined) {
  return useMemo(
    () => trpcState && transformer.deserialize<DehydratedState>(trpcState),
    [trpcState],
  );
}
