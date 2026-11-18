import { createTRPCNext } from '@trpc/next';
import type { AppRouter } from './basic.trpc';
import { shared } from './shared';

// TODO(@trpc/upgrade): move from createTRPCNext by hand, see https://trpc.io/docs/client/nextjs/pages-router/setup#moving-from-createtrpcnext
export const trpc = createTRPCNext<AppRouter>({
  ...shared,
  ssr: false,
});
