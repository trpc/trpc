---
name: nextjs-app-router
description: >
  Full end-to-end tRPC setup for Next.js App Router. Covers route handler
  with fetchRequestHandler (GET + POST exports), TRPCProvider with
  QueryClientProvider, createTRPCOptionsProxy for RSC prefetching,
  HydrateClient/HydrationBoundary for hydration, useSuspenseQuery
  for Suspense, and server-side callers.
type: framework
library: trpc
framework: react
library_version: '11.16.0'
requires:
  - server-setup
  - client-setup
  - react-query-setup
  - adapter-fetch
sources:
  - www/docs/client/nextjs/overview.mdx
  - www/docs/client/tanstack-react-query/server-components.mdx
  - www/docs/server/adapters/nextjs.md
  - examples/next-prisma-starter/
  - examples/next-sse-chat/
---

This skill builds on [server-setup], [client-setup], [react-query-setup], and [adapter-fetch]. Read them first for foundational concepts.

# tRPC -- Next.js App Router

## File Structure

```
.
├── app
│   ├── api/trpc/[trpc]
│   │   └── route.ts        # tRPC HTTP handler
│   ├── layout.tsx           # mount TRPCReactProvider
│   ├── page.tsx             # server component (prefetch)
│   └── client-greeting.tsx  # client component (consume)
├── trpc
│   ├── init.ts              # initTRPC, createTRPCContext
│   ├── routers
│   │   └── _app.ts          # main app router, AppRouter type
│   ├── query-client.ts      # shared QueryClient factory
│   ├── client.tsx           # client hooks & TRPCReactProvider
│   └── server.tsx           # server-side proxy & helpers
└── ...
```

## Setup

### 1. Install

```sh
npm install @trpc/server @trpc/client @trpc/tanstack-react-query @tanstack/react-query zod server-only client-only
```

### 2. Server init and context

```ts title="trpc/init.ts"
import { initTRPC } from '@trpc/server';

export const createTRPCContext = async (opts: { headers: Headers }) => {
  return { userId: 'user_123' };
};

const t = initTRPC
  .context<Awaited<ReturnType<typeof createTRPCContext>>>()
  .create();

export const createTRPCRouter = t.router;
export const createCallerFactory = t.createCallerFactory;
export const baseProcedure = t.procedure;
```

### 3. Define the router

```ts title="trpc/routers/_app.ts"
import { z } from 'zod';
import { baseProcedure, createTRPCRouter } from '../init';

export const appRouter = createTRPCRouter({
  hello: baseProcedure
    .input(z.object({ text: z.string() }))
    .query(({ input }) => ({
      greeting: `hello ${input.text}`,
    })),
});

export type AppRouter = typeof appRouter;
```

### 4. Route handler (API endpoint)

```ts title="app/api/trpc/[trpc]/route.ts"
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { createTRPCContext } from '../../../../trpc/init';
import { appRouter } from '../../../../trpc/routers/_app';

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: () => createTRPCContext({ headers: req.headers }),
  });

export { handler as GET, handler as POST };
```

### 5. QueryClient factory

```ts title="trpc/query-client.ts"
import {
  defaultShouldDehydrateQuery,
  QueryClient,
} from '@tanstack/react-query';

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30 * 1000,
      },
      dehydrate: {
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) ||
          query.state.status === 'pending',
      },
    },
  });
}
```

If using a data transformer (e.g., superjson), add `dehydrate.serializeData` and `hydrate.deserializeData` here.

### 6. Client provider (client component)

```tsx title="trpc/client.tsx"
'use client';

import type { QueryClient } from '@tanstack/react-query';
import { QueryClientProvider } from '@tanstack/react-query';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import { createTRPCContext } from '@trpc/tanstack-react-query';
import { useState } from 'react';
import { makeQueryClient } from './query-client';
import type { AppRouter } from './routers/_app';

export const { TRPCProvider, useTRPC, useTRPCClient } =
  createTRPCContext<AppRouter>();

let browserQueryClient: QueryClient;
function getQueryClient() {
  if (typeof window === 'undefined') {
    return makeQueryClient();
  }
  if (!browserQueryClient) browserQueryClient = makeQueryClient();
  return browserQueryClient;
}

function getUrl() {
  const base = (() => {
    if (typeof window !== 'undefined') return '';
    if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
    return 'http://localhost:3000';
  })();
  return `${base}/api/trpc`;
}

export function TRPCReactProvider(props: { children: React.ReactNode }) {
  const queryClient = getQueryClient();

  const [trpcClient] = useState(() =>
    createTRPCClient<AppRouter>({
      links: [
        httpBatchLink({
          url: getUrl(),
        }),
      ],
    }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        {props.children}
      </TRPCProvider>
    </QueryClientProvider>
  );
}
```

### 7. Server-side proxy (server component)

```tsx title="trpc/server.tsx"
import 'server-only';
import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import { createTRPCOptionsProxy } from '@trpc/tanstack-react-query';
import type { TRPCQueryOptions } from '@trpc/tanstack-react-query';
import { headers } from 'next/headers';
import { cache } from 'react';
import { createTRPCContext } from './init';
import { makeQueryClient } from './query-client';
import { appRouter } from './routers/_app';

export const getQueryClient = cache(makeQueryClient);

export const trpc = createTRPCOptionsProxy({
  ctx: async () =>
    createTRPCContext({
      headers: await headers(),
    }),
  router: appRouter,
  queryClient: getQueryClient,
});

export function HydrateClient(props: { children: React.ReactNode }) {
  const queryClient = getQueryClient();
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      {props.children}
    </HydrationBoundary>
  );
}

export function prefetch<T extends ReturnType<TRPCQueryOptions<any>>>(
  queryOptions: T,
) {
  const queryClient = getQueryClient();
  if (queryOptions.queryKey[1]?.type === 'infinite') {
    void queryClient.prefetchInfiniteQuery(queryOptions as any);
  } else {
    void queryClient.prefetchQuery(queryOptions);
  }
}
```

### 8. Mount provider in layout

```tsx title="app/layout.tsx"
import { TRPCReactProvider } from '../trpc/client';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <TRPCReactProvider>{children}</TRPCReactProvider>
      </body>
    </html>
  );
}
```

## Core Patterns

### Prefetch in server component, consume in client component

```tsx title="app/page.tsx"
import { HydrateClient, prefetch, trpc } from '../trpc/server';
import { ClientGreeting } from './client-greeting';

export default async function Home() {
  prefetch(trpc.hello.queryOptions({ text: 'world' }));

  return (
    <HydrateClient>
      <ClientGreeting />
    </HydrateClient>
  );
}
```

```tsx title="app/client-greeting.tsx"
'use client';

import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '../trpc/client';

export function ClientGreeting() {
  const trpc = useTRPC();
  const greeting = useQuery(trpc.hello.queryOptions({ text: 'world' }));
  if (!greeting.data) return <div>Loading...</div>;
  return <div>{greeting.data.greeting}</div>;
}
```

### Suspense with prefetch

```tsx title="app/page.tsx"
import { Suspense } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { HydrateClient, prefetch, trpc } from '../trpc/server';
import { ClientGreeting } from './client-greeting';

export default async function Home() {
  prefetch(trpc.hello.queryOptions({ text: 'world' }));

  return (
    <HydrateClient>
      <ErrorBoundary fallback={<div>Something went wrong</div>}>
        <Suspense fallback={<div>Loading...</div>}>
          <ClientGreeting />
        </Suspense>
      </ErrorBoundary>
    </HydrateClient>
  );
}
```

```tsx title="app/client-greeting.tsx"
'use client';

import { useSuspenseQuery } from '@tanstack/react-query';
import { useTRPC } from '../trpc/client';

export function ClientGreeting() {
  const trpc = useTRPC();
  const { data } = useSuspenseQuery(trpc.hello.queryOptions({ text: 'world' }));
  return <div>{data.greeting}</div>;
}
```

### Direct server caller (data needed on server only)

```tsx title="trpc/server.tsx"
// Add to existing server.tsx
export const caller = appRouter.createCaller(async () =>
  createTRPCContext({ headers: await headers() }),
);
```

```tsx title="app/page.tsx"
import { caller } from '../trpc/server';

export default async function Home() {
  const greeting = await caller.hello({ text: 'world' });
  return <div>{greeting.greeting}</div>;
}
```

Note: `caller` results are not stored in the query cache. They cannot hydrate to client components. Use `prefetchQuery` if client components also need the data.

### fetchQuery for data on server AND client

```tsx title="app/page.tsx"
import { getQueryClient, HydrateClient, trpc } from '../trpc/server';
import { ClientGreeting } from './client-greeting';

export default async function Home() {
  const queryClient = getQueryClient();
  const greeting = await queryClient.fetchQuery(
    trpc.hello.queryOptions({ text: 'world' }),
  );

  // Use greeting on the server
  console.log(greeting.greeting);

  return (
    <HydrateClient>
      <ClientGreeting />
    </HydrateClient>
  );
}
```

## Common Mistakes

### Not exporting both GET and POST from route handler

Next.js App Router route handlers must export named `GET` and `POST` functions. Missing either causes queries or mutations to return 405 Method Not Allowed.

```ts
// WRONG
export default function handler(req: Request) { ... }

// CORRECT
const handler = (req: Request) =>
  fetchRequestHandler({ req, router: appRouter, endpoint: '/api/trpc', createContext });
export { handler as GET, handler as POST };
```

### Creating a singleton QueryClient for SSR

In server components, each request needs its own `QueryClient` instance. A singleton leaks data between requests.

```ts
// WRONG
const queryClient = new QueryClient(); // shared across requests!

// CORRECT
export const getQueryClient = cache(makeQueryClient);
```

The `cache()` wrapper from React ensures the same `QueryClient` is reused within a single request but a new one is created for each new request.

### Missing dehydrate/shouldDehydrateQuery config

RSC hydration requires `shouldDehydrateQuery` to include pending queries so that prefetched-but-not-yet-resolved promises can stream to the client. Without this, prefetched queries may not appear in the hydrated state.

```ts
// WRONG
new QueryClient(); // default shouldDehydrateQuery skips pending

// CORRECT
new QueryClient({
  defaultOptions: {
    dehydrate: {
      shouldDehydrateQuery: (query) =>
        defaultShouldDehydrateQuery(query) || query.state.status === 'pending',
    },
  },
});
```

### Suspense query failure crashes entire page during SSR

If a query fails during SSR with `useSuspenseQuery`, the entire page crashes. Error Boundaries only catch errors on the client side. For critical pages, either handle errors server-side before rendering, or use `useQuery` (non-suspense) which allows graceful degradation.

## See Also

- [react-query-setup] -- TanStack React Query setup, queryOptions/mutationOptions factories
- [adapter-fetch] -- fetchRequestHandler for edge/serverless runtimes
- [server-setup] -- initTRPC, routers, procedures, context
- [nextjs-pages-router] -- if maintaining a Pages Router project alongside App Router
