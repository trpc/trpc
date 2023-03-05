import { createTRPCProxyClient, httpBatchLink } from '@trpc/client';
import { AppRouter } from '~/server/router';
import { getUrl } from './shared';

export const api = createTRPCProxyClient<AppRouter>({
  links: [
    httpBatchLink({
      url: getUrl(),
    }),
  ],
});
