'use client';

import { httpBatchLink, loggerLink } from '@trpc/client';
import { createTRPCNextAppRouterClient } from '@trpc/next/app-router/client';
import { AppRouter } from '~/server/router';
import { getUrl } from './shared';

export const api = createTRPCNextAppRouterClient<AppRouter>({
  config() {
    return {
      links: [
        loggerLink({
          enabled: (op) =>
            process.env.NODE_ENV === 'development' ||
            (op.direction === 'down' && op.result instanceof Error),
        }),
        httpBatchLink({
          url: getUrl(),
        }),
      ],
    };
  },
});
