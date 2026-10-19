// The client with no links: what every tRPC v12 client pays before a link.
import { createTrpcClient, routerType } from '@trpc12/trpc/client';

export const client = createTrpcClient({
  router: routerType<any>(),
  links: [],
});
