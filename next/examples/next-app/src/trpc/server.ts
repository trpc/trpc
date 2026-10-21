import 'server-only';
import { createTrpcRsc } from '@trpc12/tanstack-react-query/rsc';
import { appRouter } from '../server/router.ts';
import { transformer } from './transformer.ts';

export const { trpc, caller, prefetch, HydrationBoundary } = createTrpcRsc({
  router: appRouter,
  transformer,
});
