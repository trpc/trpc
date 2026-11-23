import { createTRPCNext } from '@trpc/next';
import type { AppRouter } from './basic.trpc';
import { shared } from './shared';

export const trpc = createTRPCNext<AppRouter>({
  ...shared,
  ssr: false,
});
