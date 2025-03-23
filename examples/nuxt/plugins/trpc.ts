import type { AppRouter } from '~/server/api/trpc/[trpc]';
import { createTRPCNuxtClient, httpBatchLink } from 'trpc-nuxt/client';

export default defineNuxtPlugin(() => {
  const trpc = createTRPCNuxtClient<AppRouter>({
    links: [httpBatchLink({ url: '/api/trpc' })],
  });

  return {
    provide: {
      trpc,
    },
  };
});
