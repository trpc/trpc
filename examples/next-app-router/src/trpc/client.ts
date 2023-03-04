import { httpBatchLink } from '@trpc/client';
import { createTRPCNextAppRouter } from '@trpc/next-app-router/client';
import { AppRouter } from '~/server/router';

export const api = createTRPCNextAppRouter<AppRouter>({
  config() {
    return {
      links: [
        httpBatchLink({
          url: '/api/trpc',
        }),
      ],
    };
  },
});
