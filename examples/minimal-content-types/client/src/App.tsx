import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpLink } from '@trpc/client';
import { useState } from 'react';
import { SendFileButton } from './SendFileButton';
import { SendMultipartFormDataButton } from './SendMultipartFormDataButton';
import { trpc } from './utils/trpc';

export function App() {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        httpLink({
          url: 'http://localhost:2022',
        }),
      ],
    }),
  );
  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <div className="min-h-svh bg-muted/40">
          <header className="border-b bg-background">
            <div className="mx-auto max-w-4xl px-6 py-4">
              <h1 className="text-lg font-bold tracking-tight">
                <span className="text-brand">tRPC</span> Content Types
              </h1>
              <p className="text-sm text-muted-foreground">
                FormData and file uploads with @trpc/react-query
              </p>
            </div>
          </header>
          <main className="mx-auto grid max-w-4xl gap-6 p-6 md:grid-cols-2">
            <SendMultipartFormDataButton />

            <SendFileButton />
          </main>
        </div>
      </QueryClientProvider>
    </trpc.Provider>
  );
}
