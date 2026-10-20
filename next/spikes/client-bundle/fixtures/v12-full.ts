// `pnpm bench budget`'s full client: retry, SSE, danSON.
import { createSerializer } from '@trpc12/trpc/serializer';
import {
  createTrpcClient,
  httpStreamLink,
  retryLink,
  routerType,
} from '@trpc12/trpc/client';

export const client = createTrpcClient({
  router: routerType<any>(),
  links: [
    retryLink(),
    httpStreamLink({ url: '/trpc', serializer: createSerializer() }),
  ],
});
