import 'server-only';
import { createTrpcRsc } from '@trpc12/tanstack-react-query/rsc';
import { appRouter } from '../server/router.ts';
import { serializer } from './serializer.ts';

export const { trpc, caller, prefetch, HydrationBoundary } = createTrpcRsc({
  router: appRouter,
  serializer,
});
