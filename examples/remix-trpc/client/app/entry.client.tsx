// client/app/entry.client.tsx
import { RemixBrowser } from '@remix-run/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import { startTransition, StrictMode } from 'react';
import { hydrateRoot } from 'react-dom/client';
import superjson from 'superjson';
import { trpc } from './lib/trpc';

const queryClient = new QueryClient();
const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: 'http://localhost:3001/trpc',
      transformer: superjson,
    }),
  ],
});

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <trpc.Provider client={trpcClient} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>
          <RemixBrowser />
        </QueryClientProvider>
      </trpc.Provider>
    </StrictMode>,
  );
});
