import { QueryClientProvider } from '@tanstack/react-query';
import { createFileRoute, Outlet } from '@tanstack/react-router';
import { useState } from 'react';

import { getQueryClient, TRPCProvider, trpcClient } from './-trpc.ts';

/**
 * The showcase's own query client, for its pages alone: the rest of the
 * site has none. Its pages hydrate it from their loaders' data
 * (`index.tsx`).
 */
export const Route = createFileRoute('/kitchen-sink/handles')({
  component: HandlesLayout,
});

function HandlesLayout() {
  const [queryClient] = useState(getQueryClient);
  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider queryClient={queryClient} trpcClient={trpcClient}>
        <Outlet />
      </TRPCProvider>
    </QueryClientProvider>
  );
}
