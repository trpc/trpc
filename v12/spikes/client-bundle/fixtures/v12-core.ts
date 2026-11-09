// The client with no links: what every tRPC v12 client pays before a link.
import { createTrpcClient, routerType } from '@trpc12/trpc/client';

export const client = createTrpcClient({
  router: routerType<any>(),
  // @ts-expect-error: a client needs a link; this measures the client alone
  links: [],
});
