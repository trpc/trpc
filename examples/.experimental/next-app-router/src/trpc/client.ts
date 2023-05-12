import { httpBatchLink } from '@trpc/client';
import { createTRPCNextAppRouterClient } from '@trpc/next-app-router/client';
import { AppRouter } from '~/server/router';
import { getUrl } from './shared';

export const api = createTRPCNextAppRouterClient<AppRouter>({
  config() {
    return {
      links: [
        httpBatchLink({
          url: getUrl(),
        }),
      ],
    };
  },
});
