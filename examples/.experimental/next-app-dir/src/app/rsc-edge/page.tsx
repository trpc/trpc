import { QueryClient } from '@tanstack/react-query';
import { createTRPCClient, httpLink } from '@trpc/client';
import { createTRPCOptionsProxy } from '@trpc/tanstack-react-query';
import React from 'react';
import superjson from 'superjson';
import type { AppRouter } from '~/server/routers/_app';

// `createTRPCOptionsProxy` must be importable from server components that run
// on the edge runtime, where `react` resolves to its `react-server` build
// without client-only APIs such as `createContext`, `useState` or `useRef`
export const runtime = 'edge';

export default function Page() {
  const trpc = createTRPCOptionsProxy<AppRouter>({
    client: createTRPCClient({
      links: [
        httpLink({
          url: 'http://localhost:3000/api/trpc',
          transformer: superjson,
        }),
      ],
    }),
    queryClient: new QueryClient(),
  });

  return (
    <div>
      <h1>Edge runtime</h1>
      <pre id="query-key">
        {JSON.stringify(trpc.greeting.queryKey({ text: 'edge' }))}
      </pre>
    </div>
  );
}
