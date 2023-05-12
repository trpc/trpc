'use server';

import { httpBatchLink, loggerLink } from '@trpc/client';
import { createTRPCNextAppRouterReactServer } from '@trpc/next-app-router/react-server';
import { AppRouter } from '~/server/router';
import { getUrl } from './shared';

export const api = createTRPCNextAppRouterReactServer<AppRouter>({
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
