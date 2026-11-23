// TODO(@trpc/upgrade): prefetch with `createTRPCOptionsProxy` and `dehydrate` instead of `createServerSideHelpers` from the deprecated `@trpc/react-query`, see https://trpc.io/docs/client/nextjs/pages-router/server-side-helpers
import { createServerSideHelpers } from '@trpc/react-query/server';
import superjson from 'superjson';
import { appRouter } from './server';

// `createServerSideHelpers` keeps `@trpc/react-query`; say what replaces it
export async function ssgInit() {
  return createServerSideHelpers({
    router: appRouter,
    ctx: {},
    transformer: superjson,
  });
}
