import { createTrpcClient, httpLink, routerType } from '@trpc12/trpc/client';
export const client = createTrpcClient({
  router: routerType<any>(),
  links: [httpLink({ url: '/trpc' })],
});
