import 'server-only';
import { createTrpcRsc } from '@trpcdev/tanstack-react-query/rsc';
import { appRouter } from '../server/router.ts';

export const { trpc, prefetch, HydrationBoundary } = createTrpcRsc({
  router: appRouter,
});
