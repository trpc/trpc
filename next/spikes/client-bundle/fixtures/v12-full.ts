// `pnpm bench budget`'s full client: retry, SSE, danSON.
import { experimental_createTransformer } from '@trpc12/trpc/transformer';
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
    httpLink({ url: '/trpc', transformer: experimental_createTransformer() }),
  ],
});
