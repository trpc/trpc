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
