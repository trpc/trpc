// `pnpm bench budget`'s full client: retry, SSE, danSON.
import { createSerializer } from '@trpc12/trpc/transformer';
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
    httpLink({ url: '/trpc', serializer: createSerializer() }),
  ],
});
