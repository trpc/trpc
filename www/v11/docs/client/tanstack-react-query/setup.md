---
id: setup
title: TanStack React Query
sidebar_label: Setup
description: Set up the TanStack React Query integration with or without React context, then query, mutate and invalidate
slug: /client/tanstack-react-query/setup
section: "Client Usage"
parent: "client/tanstack-react-query"
order: 48
skill:
  name: react-query-setup
  package: "@trpc/tanstack-react-query"
  type: framework
  requires:
    - client-setup
    - links
  description: Set up @trpc/tanstack-react-query with createTRPCContext(),
    TRPCProvider and the useTRPC() hook, or createTRPCOptionsProxy() without
    React context. Pass queryOptions/infiniteQueryOptions/mutationOptions/
    subscriptionOptions factories to TanStack Query hooks, invalidate with
    queryClient.invalidateQueries and queryFilter/pathFilter, read and write the
    cache with queryKey, prefix keys with keyPrefix, and infer types with
    inferInput/inferOutput.
  references:
    - client/tanstack-react-query/usage
    - client/tanstack-react-query/server-components
---

Compared to our [classic React Query Integration](/docs/client/react) this client is simpler and more TanStack Query-native, providing factories for common TanStack React Query interfaces like QueryKeys, QueryOptions, and MutationOptions. We think it's the future and recommend using this over the classic client, <a href="/blog/introducing-tanstack-react-query-client">read the announcement post</a> for more information about this change.

:::tip
You can try this integration out on the homepage of tRPC.io: [https://trpc.io/?try=minimal-react#try-it-out](https://trpc.io/?try=minimal-react#try-it-out)
:::

<details>
<summary>❓ Do I have to use an integration?</summary>

No! The integration is fully optional. You can use `@tanstack/react-query` using just a [vanilla tRPC client](/docs/client/vanilla), although then you'll have to manually manage query keys and do not get the same level of DX as when using the integration package.

```ts twoslash title='utils/trpc.ts'
// @filename: server/router.ts
import { initTRPC } from '@trpc/server';
const t = initTRPC.create();
const appRouter = t.router({
  post: t.router({
    list: t.procedure.query(() => [{ id: '1', title: 'Hello' }]),
  }),
});
export type AppRouter = typeof appRouter;

// @filename: utils/trpc.ts
// ---cut---
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from '../server/router';

export const trpc = createTRPCClient<AppRouter>({
  links: [httpBatchLink({ url: 'YOUR_API_URL' })],
});
```

```tsx twoslash title='components/PostList.tsx'
// @filename: server/router.ts
import { initTRPC } from '@trpc/server';
const t = initTRPC.create();
const appRouter = t.router({
  post: t.router({
    list: t.procedure.query(() => [{ id: '1', title: 'Hello' }]),
  }),
});
export type AppRouter = typeof appRouter;

// @filename: utils/trpc.ts
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from '../server/router';
export const trpc = createTRPCClient<AppRouter>({
  links: [httpBatchLink({ url: 'YOUR_API_URL' })],
});

// @filename: component.tsx
// ---cut---
import { useQuery } from '@tanstack/react-query';
import { trpc } from './utils/trpc';

function PostList() {
  const { data } = useQuery({
    queryKey: ['posts'] as const,
    queryFn: () => trpc.post.list.query(),
  });
  data; // Post[]

  // ...
}
```

</details>

## Setup

### 1. Install dependencies

The following dependencies should be installed

```package-install
@trpc/server @trpc/client @trpc/tanstack-react-query @tanstack/react-query
```

### 2. Import your `AppRouter`

```twoslash include router
// @filename: server/router.ts
// ---cut---
import { initTRPC } from '@trpc/server';
import { z } from "zod";
const t = initTRPC.create();

const appRouter = t.router({
  getUser: t.procedure.input(z.object({ id: z.string() })).query(() => ({ name: 'foo' })),
  createUser: t.procedure.input(z.object({ name: z.string() })).mutation(() => 'bar'),
});
export type AppRouter = typeof appRouter;
```

```twoslash include utils-a
// @filename: utils/trpc.ts
// ---cut---
import { createTRPCContext, type TRPCOptionsProxy } from '@trpc/tanstack-react-query';
import type { AppRouter } from '../server/router';

export const { TRPCProvider, useTRPC, useTRPCClient } = createTRPCContext<AppRouter>();
// Types the query handles that components take as props
export type TRPC = TRPCOptionsProxy<AppRouter>;
```

Import your `AppRouter` type into the client application. This type holds the shape of your entire API.

```ts twoslash title="utils/trpc.ts"
// @filename: server/router.ts
// ---cut---
import { initTRPC } from '@trpc/server';
import { z } from "zod";
const t = initTRPC.create();

const appRouter = t.router({
  post: t.router({
    byId: t.procedure
      .input(z.object({ id: z.string() }))
      .query(async ({input}) => {
        return { id: input.id, title: 'Hello' };
      }),
  })
});
export type AppRouter = typeof appRouter;
// @filename: utils/trpc.ts
// ---cut---
import type { AppRouter } from '../server/router';
```

:::tip
By using `import type` you ensure that the reference will be stripped at compile-time, meaning you don't inadvertently import server-side code into your client. For more information, [see the Typescript docs](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-8.html#type-only-imports-and-export).
:::

### 3a. Set up the tRPC context provider

In cases where you rely on React context, such as when using server-side rendering in full-stack frameworks like Next.js, it's important to create a new QueryClient for each request so that your users don't end up sharing the same cache, you can use the `createTRPCContext` to create a set of type-safe context providers and consumers from your `AppRouter` type signature.

```tsx title='utils/trpc.ts' twoslash
// @include: router
// @include: utils-a
```

Then, create a tRPC client, and wrap your application in the `TRPCProvider`, as below. You will also need to set up and connect React Query, which [they document in more depth](https://tanstack.com/query/latest/docs/framework/react/quick-start).

:::tip
If you already use React Query in your application, you **should** re-use the `QueryClient` and `QueryClientProvider` you already have. You can read more about the QueryClient initialization in the [React Query docs](https://tanstack.com/query/latest/docs/framework/react/guides/advanced-ssr#initial-setup).
:::

```tsx twoslash title='components/App.tsx'
// @jsx: react-jsx
// @include: router
// @include: utils-a

// @filename: components/App.tsx
// ---cut---
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import { useState } from 'react';
import type { AppRouter } from '../server/router';
import { TRPCProvider } from '../utils/trpc';

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // With SSR, we usually want to set some default staleTime
        // above 0 to avoid refetching immediately on the client
        staleTime: 60 * 1000,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined = undefined;

function getQueryClient() {
  if (typeof window === 'undefined') {
    // Server: always make a new query client
    return makeQueryClient();
  } else {
    // Browser: make a new query client if we don't already have one
    // This is very important, so we don't re-make a new client if React
    // suspends during the initial render. This may not be needed if we
    // have a suspense boundary BELOW the creation of the query client
    if (!browserQueryClient) browserQueryClient = makeQueryClient();
    return browserQueryClient;
  }
}

export function App() {
  const queryClient = getQueryClient();
  const [trpcClient] = useState(() =>
    createTRPCClient<AppRouter>({
      links: [
        httpBatchLink({
          url: 'http://localhost:2022',
        }),
      ],
    }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        {null /* Your app here */}
      </TRPCProvider>
    </QueryClientProvider>
  );
}
```

### 3b. Set up with Query/Mutation Key Prefixing enabled

If you want to prefix all queries and mutations with a specific key, see [Query Key Prefixing](./usage.md#keyPrefix) for setup and usage examples.

### 3c. Set up without React context

When building an SPA using only client-side rendering with something like Vite, you can create the `QueryClient` and tRPC client outside of React context as singletons.

```ts twoslash title='utils/trpc.ts'
// @include: router

// @filename: utils/trpc.ts
// ---cut---
import { QueryClient } from '@tanstack/react-query';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import { createTRPCOptionsProxy } from '@trpc/tanstack-react-query';
import type { AppRouter } from '../server/router';

export const queryClient = new QueryClient();

const trpcClient = createTRPCClient<AppRouter>({
  links: [httpBatchLink({ url: 'http://localhost:2022' })],
});

export const trpc = createTRPCOptionsProxy<AppRouter>({
  client: trpcClient,
  queryClient,
});
```

```tsx twoslash title='components/App.tsx'
// @include: router

// @filename: utils/trpc.ts
import { QueryClient } from '@tanstack/react-query';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import { createTRPCOptionsProxy } from '@trpc/tanstack-react-query';
import type { AppRouter } from '../server/router';
export const queryClient = new QueryClient();
const trpcClient = createTRPCClient<AppRouter>({
  links: [httpBatchLink({ url: 'http://localhost:2022' })],
});
export const trpc = createTRPCOptionsProxy<AppRouter>({
  client: trpcClient,
  queryClient,
});

// @filename: components/App.tsx
import React from 'react';
// ---cut---
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '../utils/trpc';

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      {/* Your app here */}
    </QueryClientProvider>
  );
}
```

### 4. Fetch data

Start a page's queries before the components that show them render, and pass each component a **handle** to its query. The component reads the query from its handle, typed from the procedure, without repeating the procedure or its input.

```tsx twoslash title='components/user-card.tsx'
// @jsx: react-jsx
// @include: router
// @include: utils-a

// @filename: components/user-card.tsx
// ---cut---
import { useMutation, useSuspenseQuery } from '@tanstack/react-query';
import type { unstable_inferQueryHandle } from '@trpc/tanstack-react-query';
import { useTRPC, type TRPC } from '../utils/trpc';

export function UserCard(props: {
  user: unstable_inferQueryHandle<TRPC['getUser']>;
}) {
  const trpc = useTRPC();
  const userQuery = useSuspenseQuery(trpc.unstable_$fromHandle(props.user));
  const userCreator = useMutation(trpc.createUser.mutationOptions());

  return (
    <div>
      <p>{userQuery.data.name}</p>

      <button onClick={() => userCreator.mutate({ name: 'Frodo' })}>
        Create Frodo
      </button>
    </div>
  );
}
```

In a route loader or a server component, start the query with `unstable_$ensure`. It waits until the data is in the cache, so the page renders with it, and it rejects if the query fails, so you can handle the error before rendering. Here, in a React Router loader, `trpc` is the [singleton proxy](#3c-set-up-without-react-context), created with the same `queryClient` you give `TRPCProvider`:

```tsx twoslash title='routes/user.tsx'
// @jsx: react-jsx
// @include: router
// @include: utils-a
// @filename: utils/trpc-singleton.ts
import { QueryClient } from '@tanstack/react-query';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import { createTRPCOptionsProxy } from '@trpc/tanstack-react-query';
import type { AppRouter } from '../server/router';
export const queryClient = new QueryClient();
export const trpc = createTRPCOptionsProxy<AppRouter>({
  client: createTRPCClient<AppRouter>({ links: [httpBatchLink({ url: 'http://localhost:2022' })] }),
  queryClient,
});

// @filename: components/user-card.tsx
import type { unstable_inferQueryHandle } from '@trpc/tanstack-react-query';
import type { TRPC } from '../utils/trpc';
export declare function UserCard(props: {
  user: unstable_inferQueryHandle<TRPC['getUser']>;
}): React.ReactNode;

// @filename: routes/user.tsx
import { trpc } from '../utils/trpc-singleton';
// ---cut---
import { Suspense } from 'react';
import { useLoaderData, type LoaderFunctionArgs } from 'react-router';
import { UserCard } from '../components/user-card';

export async function loader({ params }: LoaderFunctionArgs) {
  const user = await trpc.getUser.unstable_$ensure({ id: params.id! });
  return { user };
}

export function UserRoute() {
  const { user } = useLoaderData<typeof loader>();
  return (
    <Suspense fallback={<p>Loading user…</p>}>
      <UserCard user={user} />
    </Suspense>
  );
}
```

Without a loader, start the query at the top of the page as it renders, with `unstable_$prefetch` on `useTRPC()`. It starts the query only if the cache doesn't have it yet, and `UserCard` suspends until the data arrives:

```tsx twoslash title='pages/user-page.tsx'
// @jsx: react-jsx
// @include: router
// @include: utils-a

// @filename: components/user-card.tsx
import type { unstable_inferQueryHandle } from '@trpc/tanstack-react-query';
import type { TRPC } from '../utils/trpc';
export declare function UserCard(props: {
  user: unstable_inferQueryHandle<TRPC['getUser']>;
}): React.ReactNode;

// @filename: pages/user-page.tsx
// ---cut---
import { Suspense } from 'react';
import { UserCard } from '../components/user-card';
import { useTRPC } from '../utils/trpc';

export function UserPage(props: { id: string }) {
  const trpc = useTRPC();
  const user = trpc.getUser.unstable_$prefetch({ id: props.id });

  return (
    <Suspense fallback={<p>Loading user…</p>}>
      <UserCard user={user} />
    </Suspense>
  );
}
```

- Every reader needs a loading state, even after `unstable_$ensure`: the cache can drop the data later, for example after `queryClient.resetQueries()`. Here, that's the `Suspense` fallback. See [When the cache loses the data](/docs/client/tanstack-react-query/handles#cache-loses-data).
- Start queries in render only on `useTRPC()`. On the singleton proxy, `unstable_$prefetch` refetches stale data on every call, so start its queries in a loader.
- To read a query without a handle, pass `trpc.getUser.queryOptions({ id })` to the hook. See [`queryOptions`](./usage.md#queryOptions).

See [Prefetching with handles](/docs/client/tanstack-react-query/handles) for streaming with `unstable_$prefetch`, infinite queries, and where to start queries in each framework.

:::info
We have prefixed the handle APIs with `unstable_` as they're new, but you're safe to use them! [Read more](/docs/faq#unstable).
:::

### 5. Invalidate queries after a mutation

There is no tRPC-specific cache API: use TanStack's `QueryClient` with the keys and filters from `trpc`. `queryFilter()` matches one procedure, for every input if you leave the input out, `pathFilter()` matches every query under a router, and `trpc.pathFilter()` matches every tRPC query. See [Usage](./usage.md) for all of them.

```tsx twoslash title='components/create-user.tsx'
// @jsx: react-jsx
// @filename: server/router.ts
import { initTRPC } from '@trpc/server';
import { z } from 'zod';
const t = initTRPC.create();
const appRouter = t.router({
  user: t.router({
    byId: t.procedure
      .input(z.object({ id: z.string() }))
      .query(({ input }) => ({ id: input.id, name: 'Bilbo' })),
    create: t.procedure
      .input(z.object({ name: z.string() }))
      .mutation(({ input }) => ({ id: 'id_frodo', name: input.name })),
  }),
});
export type AppRouter = typeof appRouter;

// @filename: utils/trpc.ts
import { createTRPCContext } from '@trpc/tanstack-react-query';
import type { AppRouter } from '../server/router';
export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();

// @filename: components/create-user.tsx
// ---cut---
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTRPC } from '../utils/trpc';

export function CreateUser() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const userCreator = useMutation(
    trpc.user.create.mutationOptions({
      onSuccess: async (user) => {
        // Write the new user into the cache...
        queryClient.setQueryData(trpc.user.byId.queryKey({ id: user.id }), user);
        // ...and refetch every query under the `user` router
        await queryClient.invalidateQueries(trpc.user.pathFilter());
      },
    }),
  );

  return (
    <button onClick={() => userCreator.mutate({ name: 'Frodo' })}>
      Create Frodo
    </button>
  );
}
```

## Common mistakes

- **Calling `queryFilter()` on a router.** `queryOptions`, `queryKey` and `queryFilter` only exist on query procedures. For a router, use `pathKey()` and `pathFilter()`.
- **Writing query keys by hand.** A `useQuery({ queryKey: ['user', id], queryFn })` that calls the tRPC client works, but its key isn't tRPC's, so `queryFilter()`/`pathFilter()` invalidations and server-prefetched data never match it. Use the `trpc` factories instead.
- **Using the classic hooks.** `trpc.user.byId.useQuery()` and `trpc.useUtils()` belong to the [classic `@trpc/react-query` client](/docs/client/react). In this package, pass `trpc.*.queryOptions()` to TanStack's hooks and use `useQueryClient()` for the cache. See [Migrating](./migrating.md).
- **Calling `useTRPC()` outside the provider.** It throws `useTRPC() can only be used inside of a <TRPCProvider>`. Mount `TRPCProvider`, with the same `queryClient` you give `QueryClientProvider`, above every component that calls `useTRPC()`. The [singleton setup](#3c-set-up-without-react-context) has no provider: import `trpc` instead.
- **Sharing one `QueryClient` across server requests.** A module-level `new QueryClient()` is fine in a client-only SPA, but with server rendering it leaks one user's cache into another's. Create one per request on the server, as `getQueryClient()` does above.
