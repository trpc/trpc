// retryLink (an Effect link) in front of the Promise httpLink: the first
// Effect link brings the runtime.
import {
  createTrpcClient,
  httpLink,
  retryLink,
  routerType,
} from '@trpc12/trpc/client';

export const client = createTrpcClient({
  router: routerType<any>(),
  links: [retryLink(), httpLink({ url: '/trpc' })],
});
