import {
  CreateTRPCClientOptions,
  createTRPCProxyClient,
  httpBatchLink,
  loggerLink,
} from '@trpc/client';
import { AppRouter } from './server/routers/_app';

export const clientOptions: CreateTRPCClientOptions<AppRouter> = {
  links: [
    loggerLink(),
    httpBatchLink({
      url: `/api/trpc`,
    }),
  ],
};

export const trpc = createTRPCProxyClient(clientOptions);
