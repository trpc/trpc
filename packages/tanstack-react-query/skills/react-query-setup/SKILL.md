---
name: react-query-setup
description: >
  Set up @trpc/tanstack-react-query with createTRPCContext(), TRPCProvider,
  useTRPC() hook, queryOptions/mutationOptions factories, query invalidation
  via queryClient.invalidateQueries with queryFilter, and type inference
  with inferInput/inferOutput.
type: framework
library: trpc
framework: react
library_version: '11.16.0'
requires:
  - client-setup
  - links
sources:
  - www/docs/client/tanstack-react-query/overview.md
  - www/docs/client/tanstack-react-query/setup.mdx
  - www/docs/client/tanstack-react-query/usage.mdx
  - packages/tanstack-react-query/src/
---

This skill builds on [client-setup] and [links]. Read them first for foundational concepts.

# tRPC -- TanStack React Query Setup

## Setup

### Install

```sh
npm install @trpc/server @trpc/client @trpc/tanstack-react-query @tanstack/react-query
```

### Create the tRPC context (with React context)

```ts title="utils/trpc.ts"
import { createTRPCContext } from '@trpc/tanstack-react-query';
import type { AppRouter } from '../server/router';

export const { TRPCProvider, useTRPC, useTRPCClient } =
  createTRPCContext<AppRouter>();
```

### Wire up providers

```tsx title="components/App.tsx"
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import { useState } from 'react';
import type { AppRouter } from '../server/router';
import { TRPCProvider } from '../utils/trpc';

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined = undefined;

function getQueryClient() {
  if (typeof window === 'undefined') {
    return makeQueryClient();
  }
  if (!browserQueryClient) browserQueryClient = makeQueryClient();
  return browserQueryClient;
}

export function App() {
  const queryClient = getQueryClient();
  const [trpcClient] = useState(() =>
    createTRPCClient<AppRouter>({
      links: [
        httpBatchLink({
          url: 'http://localhost:3000/api/trpc',
        }),
      ],
    }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        {/* Your app here */}
      </TRPCProvider>
    </QueryClientProvider>
  );
}
```

### Alternative: setup without React context (SPA / Vite)

```ts title="utils/trpc.ts"
import { QueryClient } from '@tanstack/react-query';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import { createTRPCOptionsProxy } from '@trpc/tanstack-react-query';
import type { AppRouter } from '../server/router';

export const queryClient = new QueryClient();

const trpcClient = createTRPCClient<AppRouter>({
  links: [httpBatchLink({ url: 'http://localhost:3000/api/trpc' })],
});

export const trpc = createTRPCOptionsProxy<AppRouter>({
  client: trpcClient,
  queryClient,
});
```

When using the singleton pattern, wrap your app with `QueryClientProvider` only (no `TRPCProvider` needed) and import `trpc` directly instead of calling `useTRPC()`.

## Core Patterns

### queryOptions -- querying data

```tsx title="components/UserList.tsx"
import { skipToken, useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { useTRPC } from '../utils/trpc';

function UserList() {
  const trpc = useTRPC();

  // Basic query
  const userQuery = useQuery(trpc.user.byId.queryOptions({ id: '1' }));

  // With TanStack Query options
  const staleQuery = useQuery(
    trpc.user.byId.queryOptions({ id: '1' }, { staleTime: 5000 }),
  );

  // Suspense query
  const { data } = useSuspenseQuery(trpc.user.byId.queryOptions({ id: '1' }));

  // Conditional query with skipToken
  const conditionalQuery = useQuery(
    trpc.user.byId.queryOptions(userId ? { id: userId } : skipToken),
  );

  return <div>{userQuery.data?.name}</div>;
}
```

### mutationOptions -- writing data

```tsx
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTRPC } from '../utils/trpc';

function CreateUser() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const createUser = useMutation(
    trpc.user.create.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries(trpc.user.queryFilter());
      },
    }),
  );

  return (
    <button onClick={() => createUser.mutate({ name: 'Alice' })}>Create</button>
  );
}
```

### Query invalidation and cache manipulation

```tsx
import { useQueryClient } from '@tanstack/react-query';
import { useTRPC } from '../utils/trpc';

function InvalidationExample() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  // Invalidate a specific query
  const invalidateOne = () =>
    queryClient.invalidateQueries(trpc.user.byId.queryFilter({ id: '1' }));

  // Invalidate all queries under a router
  const invalidateAll = () =>
    queryClient.invalidateQueries(trpc.user.queryFilter());

  // Invalidate ALL tRPC queries
  const invalidateEverything = () =>
    queryClient.invalidateQueries({ queryKey: trpc.pathKey() });

  // Read/write cache directly
  const cached = queryClient.getQueryData(trpc.user.byId.queryKey({ id: '1' }));
  queryClient.setQueryData(trpc.user.byId.queryKey({ id: '1' }), {
    id: '1',
    name: 'Updated',
  });
}
```

### infiniteQueryOptions -- paginated data

```tsx
import { useInfiniteQuery } from '@tanstack/react-query';
import { useTRPC } from '../utils/trpc';

function InfiniteList() {
  const trpc = useTRPC();

  const posts = useInfiniteQuery(
    trpc.post.list.infiniteQueryOptions(
      { limit: 10 },
      {
        getNextPageParam: (lastPage) => lastPage.nextCursor,
      },
    ),
  );

  return (
    <div>
      {posts.data?.pages.flatMap((page) =>
        page.items.map((item) => <div key={item.id}>{item.title}</div>),
      )}
      <button onClick={() => posts.fetchNextPage()}>Load more</button>
    </div>
  );
}
```

### subscriptionOptions -- real-time data

```tsx
import { useSubscription } from '@trpc/tanstack-react-query';
import { useTRPC } from '../utils/trpc';

function ChatMessages() {
  const trpc = useTRPC();

  const sub = useSubscription(
    trpc.chat.onMessage.subscriptionOptions(
      { channelId: 'general' },
      {
        onData: (message) => {
          console.log('New message:', message);
        },
        onError: (err) => {
          console.error('Subscription error:', err);
        },
      },
    ),
  );

  return (
    <div>
      Status: {sub.status}, Last: {JSON.stringify(sub.data)}
    </div>
  );
}
```

### Type inference

```ts
import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';
import type { inferInput, inferOutput } from '@trpc/tanstack-react-query';
import type { AppRouter } from '../server/router';

// Router-level inference
type Inputs = inferRouterInputs<AppRouter>;
type Outputs = inferRouterOutputs<AppRouter>;
type UserInput = Inputs['user']['byId'];
type UserOutput = Outputs['user']['byId'];

// Procedure-level inference (inside component)
// const trpc = useTRPC();
// type Input = inferInput<typeof trpc.user.byId>;
// type Output = inferOutput<typeof trpc.user.byId>;
```

### Accessing the tRPC client directly

```tsx
import { useTRPCClient } from '../utils/trpc';

async function DirectCall() {
  const client = useTRPCClient();
  const result = await client.user.byId.query({ id: '1' });
}
```

## Common Mistakes

### Using useQuery without the queryOptions factory

Calling `useQuery({ queryKey: [...], queryFn: ... })` manually bypasses tRPC's type-safe query key generation and loses autocomplete. Always use the options factory.

```tsx
// WRONG
useQuery({ queryKey: ['user', id], queryFn: () => fetch(...) });

// CORRECT
const trpc = useTRPC();
useQuery(trpc.user.byId.queryOptions({ id }));
```

### Missing TRPCProvider wrapper

`useTRPC()` throws `"can only be used inside a <TRPCProvider>"` if the component tree is not wrapped. Ensure `TRPCProvider` is mounted above all components that call `useTRPC()`, typically in your root `App` component.

### Invalidating queries with the classic utils pattern

The new `@trpc/tanstack-react-query` package does not use `utils.invalidate()`. Use `queryClient.invalidateQueries()` with `queryFilter()` instead.

```tsx
// WRONG -- classic pattern does not work with new package
utils.post.invalidate();

// CORRECT
const trpc = useTRPC();
const queryClient = useQueryClient();
queryClient.invalidateQueries(trpc.post.queryFilter());
```

### Creating a singleton QueryClient for SSR

In server-rendered apps, a singleton `QueryClient` leaks data between requests. Always create a new `QueryClient` per request on the server, and reuse a single instance only in the browser.

```ts
// WRONG
const queryClient = new QueryClient(); // shared across requests!

// CORRECT
function getQueryClient() {
  if (typeof window === 'undefined') return makeQueryClient();
  if (!browserQueryClient) browserQueryClient = makeQueryClient();
  return browserQueryClient;
}
```

## See Also

- [client-setup] -- vanilla tRPC client, links, and transport configuration
- [links] -- httpBatchLink, splitLink, and other link types
- [react-query-classic-migration] -- migrating from @trpc/react-query to @trpc/tanstack-react-query
- [nextjs-app-router] -- using this integration with Next.js App Router and RSC
