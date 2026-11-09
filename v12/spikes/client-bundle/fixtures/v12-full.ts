// `pnpm bench budget`'s full client: retry, SSE, progressive JSON.
import { experimental_createProgressiveJson } from '@trpc12/trpc/transformer';
import {
  createTrpcClient,
  httpLink,
  retryLink,
  routerType,
} from '@trpc12/trpc/client';

export const client = createTrpcClient({
  router: routerType<any>(),
  links: [
    retryLink(),
    httpLink({
      url: '/trpc',
      transformer: experimental_createProgressiveJson(),
    }),
  ],
});
