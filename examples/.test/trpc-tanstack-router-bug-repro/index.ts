import { QueryClient } from '@tanstack/react-query';
import { createTRPCOptionsProxy } from '@trpc/tanstack-react-query';

const queryClient = new QueryClient();

const trpc = createTRPCOptionsProxy({
  client: null as any,
  queryClient,
});
