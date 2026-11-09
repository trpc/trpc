import { QueryClient } from '@tanstack/react-query';
import { createTrpcQueryUtils } from '@trpc12/tanstack-react-query';
import type { Client } from './client.ts';

/** Query options for loaders and server code, outside React. */
export function makeQueries(client: Client) {
  const queryClient = new QueryClient();
  const trpc = createTrpcQueryUtils({ client });
  return { queryClient, trpc };
}
