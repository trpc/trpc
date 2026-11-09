import { QueryClient } from '@tanstack/react-query';
import type { TRPCClient } from '@trpc/client';
import { createTRPCOptionsProxy } from '@trpc/tanstack-react-query';
import type { AppRouter } from '../server/router.ts';

/** Query options for loaders and server code, outside React. */
export function makeQueries(client: TRPCClient<AppRouter>) {
  const queryClient = new QueryClient();
  const trpc = createTRPCOptionsProxy<AppRouter>({ client, queryClient });
  return { queryClient, trpc };
}
