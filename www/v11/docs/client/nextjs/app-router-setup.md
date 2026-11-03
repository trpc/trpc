---
id: setup
title: Set up with Next.js App Router
sidebar_label: "App Router"
slug: /client/nextjs/app-router-setup
section: "Client Usage"
parent: "client/nextjs"
order: 68
skill:
  name: nextjs-app-router
  package: "@trpc/next"
  type: framework
  requires:
    - server-setup
    - client-setup
    - react-query-setup
    - adapter-fetch
  description: Full end-to-end tRPC setup for Next.js App Router with
    @trpc/tanstack-react-query. Covers the route handler with
    fetchRequestHandler (GET + POST exports), a per-request QueryClient that
    dehydrates pending queries, TRPCProvider and useTRPC() in client
    components, createTRPCOptionsProxy with prefetch and
    HydrateClient/HydrationBoundary in server components, useSuspenseQuery for
    Suspense, createCaller or fetchQuery for data on the server, and
    tRPC-powered Server Actions.
  references:
    - client/nextjs/server-actions
---

:::note
We recommend reading TanStack React Query's [Advanced Server Rendering](https://tanstack.com/query/latest/docs/framework/react/guides/advanced-ssr) docs to understand the different types of server rendering
and footguns to avoid.
:::

## Recommended file structure

```graphql
.
├── src
│   ├── app
│   │   ├── api
│   │   │   └── trpc
│   │   │       └── [trpc]
│   │   │           └── route.ts  # <-- tRPC HTTP handler
│   │   ├── layout.tsx            # <-- mount TRPCReactProvider
│   │   └── page.tsx              # <-- server component
│   ├── trpc
│   │   ├── init.ts               # <-- tRPC server init & context
│   │   ├── routers
│   │   │   ├── _app.ts           # <-- main app router
│   │   │   ├── post.ts           # <-- sub routers
│   │   │   └── [..]
│   │   ├── client.tsx            # <-- client hooks & provider
│   │   ├── query-client.ts       # <-- shared QueryClient factory
│   │   └── server.tsx            # <-- server-side caller
│   └── [..]
└── [..]
```

## Add tRPC to an existing Next.js App Router project

### 1. Install deps

```package-install
@trpc/server @trpc/client @trpc/tanstack-react-query @tanstack/react-query@latest zod client-only server-only
```

### 2. Create a tRPC router

Initialize your tRPC backend in `trpc/init.ts` using the `initTRPC` function, and create your first router. We're going to make a simple "hello world" router and procedure here — for deeper information on creating your tRPC API, refer to the [Quickstart guide](/docs/quickstart) and [Backend usage docs](/docs/server/overview).

```ts twoslash title='trpc/init.ts'
import { initTRPC } from '@trpc/server';

/**
 * This context creator accepts `headers` so it can be reused in both
 * the RSC server caller (where you pass `next/headers`) and the
 * API route handler (where you pass the request headers).
 */
export const createTRPCContext = async (opts: { headers: Headers }) => {
  // const user = await auth(opts.headers);
  return { userId: 'user_123' };
};

// Avoid exporting the entire t-object
// since it's not very descriptive.
// For instance, the use of a t variable
// is common in i18n libraries.
const t = initTRPC
  .context<Awaited<ReturnType<typeof createTRPCContext>>>()
  .create({
    /**
     * @see https://trpc.io/docs/server/data-transformers
     */
    // transformer: superjson,
  });

// Base router and procedure helpers
export const createTRPCRouter = t.router;
export const createCallerFactory = t.createCallerFactory;
export const baseProcedure = t.procedure;
```

<br />

```ts twoslash title='trpc/routers/_app.ts'
// @filename: trpc/init.ts
import { initTRPC } from '@trpc/server';
const t = initTRPC.create();
export const createTRPCRouter = t.router;
export const baseProcedure = t.procedure;

// @filename: trpc/routers/_app.ts
// ---cut---
import { z } from 'zod';
import { baseProcedure, createTRPCRouter } from '../init';

export const appRouter = createTRPCRouter({
  hello: baseProcedure
    .input(
      z.object({
        text: z.string(),
      }),
    )
    .query((opts) => {
      return {
        greeting: `hello ${opts.input.text}`,
      };
    }),
});

// export type definition of API
export type AppRouter = typeof appRouter;
```

### 3. Create the API route handler

With the App Router, use the [fetch adapter](/docs/server/adapters/fetch) to handle tRPC requests. Create a route handler that exports both `GET` and `POST`:

```ts twoslash title='app/api/trpc/[trpc]/route.ts'
// @filename: trpc/init.ts
import { initTRPC } from '@trpc/server';
export const createTRPCContext = async (opts: { headers: Headers }) => {
  return { userId: 'user_123' };
};
const t = initTRPC.create();
export const createTRPCRouter = t.router;
export const baseProcedure = t.procedure;

// @filename: trpc/routers/_app.ts
import { createTRPCRouter } from '../init';
export const appRouter = createTRPCRouter({});
export type AppRouter = typeof appRouter;

// @filename: route.ts
// ---cut---
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { createTRPCContext } from './trpc/init';
import { appRouter } from './trpc/routers/_app';

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: () => createTRPCContext({ headers: req.headers }),
  });

export { handler as GET, handler as POST };
```

:::note
App Router uses the [fetch adapter](/docs/server/adapters/fetch) (via `fetchRequestHandler`) rather than the Next.js-specific adapter used by the Pages Router. This is because App Router route handlers are based on the Web standard `Request` and `Response` objects.
:::

### 4. Create a Query Client factory

Create a shared file `trpc/query-client.ts` that exports a function that creates a `QueryClient` instance.

```ts twoslash title='trpc/query-client.ts'
import {
  defaultShouldDehydrateQuery,
  QueryClient,
} from '@tanstack/react-query';
import superjson from 'superjson';

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30 * 1000,
      },
      dehydrate: {
        // serializeData: superjson.serialize,
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) ||
          query.state.status === 'pending',
      },
      hydrate: {
        // deserializeData: superjson.deserialize,
      },
    },
  });
}
```

We're setting a few default options here:

- `staleTime`: With SSR, we usually want to set some default staleTime above 0 to avoid refetching immediately on the client.
- `shouldDehydrateQuery`: This is a function that determines whether a query should be dehydrated or not. Since the RSC transport protocol
  supports hydrating promises over the network, we extend the `defaultShouldDehydrateQuery` function to also include queries that are
  still pending. This will allow us to start prefetching in a server component high up the tree, then consuming that promise in a client component further down.
- `serializeData` and `deserializeData` (optional): If you set up a [data transformer](../../server/data-transformers.md) in the previous step, set this option
  to make sure the data is serialized correctly when hydrating the query client over the server-client boundary.

### 5. Create a tRPC client for Client Components

The `trpc/client.tsx` is the entrypoint when consuming your tRPC API from client components. In here, import the **type definition** of
your tRPC router and create typesafe hooks using `createTRPCContext`. We'll also export our context provider from this file.

```tsx twoslash title='trpc/client.tsx'
// @jsx: react-jsx
// @filename: trpc/query-client.ts
import { QueryClient } from '@tanstack/react-query';
export function makeQueryClient() { return new QueryClient(); }

// @filename: trpc/routers/_app.ts
import { initTRPC } from '@trpc/server';
import { z } from 'zod';
const t = initTRPC.create();
export const appRouter = t.router({
  hello: t.procedure.input(z.object({ text: z.string() })).query(({ input }) => ({ greeting: `hello ${input.text}` })),
});
export type AppRouter = typeof appRouter;

// @filename: trpc/client.tsx
// ---cut---
'use client';

// ^-- to make sure we can mount the Provider from a server component
import type { QueryClient } from '@tanstack/react-query';
import { QueryClientProvider } from '@tanstack/react-query';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import { createTRPCContext } from '@trpc/tanstack-react-query';
import { useState } from 'react';
import { makeQueryClient } from './query-client';
import type { AppRouter } from './routers/_app';

export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();

let browserQueryClient: QueryClient;
function getQueryClient() {
  if (typeof window === 'undefined') {
    // Server: always make a new query client
    return makeQueryClient();
  }
  // Browser: make a new query client if we don't already have one
  // This is very important, so we don't re-make a new client if React
  // suspends during the initial render. This may not be needed if we
  // have a suspense boundary BELOW the creation of the query client
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

export function TRPCReactProvider(
  props: Readonly<{
    children: React.ReactNode;
  }>,
) {
  // NOTE: Avoid useState when initializing the query client if you don't
  //       have a suspense boundary between this and the code that may
  //       suspend because React will throw away the client on the initial
  //       render if it suspends and there is no boundary
  const queryClient = getQueryClient();

  const [trpcClient] = useState(() =>
    createTRPCClient<AppRouter>({
      links: [
        httpBatchLink({
          // transformer: superjson, <-- if you use a data transformer
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

Mount the provider in the root layout of your application:

```tsx twoslash title='app/layout.tsx'
// @jsx: react-jsx
// @filename: types.d.ts
declare module '~/trpc/client' {
  export function TRPCReactProvider(props: { children: React.ReactNode }): React.JSX.Element;
}

// @filename: app/layout.tsx
// ---cut---
import { TRPCReactProvider } from '~/trpc/client';

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <TRPCReactProvider>{children}</TRPCReactProvider>
      </body>
    </html>
  );
}
```

### 6. Create a tRPC caller for Server Components

To prefetch queries from server components, we create a proxy from our router. You can also pass in a client if your router is on a separate server. We'll also add a `HydrateClient` component that hands the prefetched queries to client components, a `prefetch` helper, and a `caller` for [getting data in a Server Component](#getting-data-in-a-server-component).

```tsx twoslash title='trpc/server.tsx'
// @jsx: react-jsx
// @filename: server-only.d.ts
export {};

// @filename: init.ts
export const createTRPCContext = async (opts: { headers: Headers }) => {
  return { userId: 'user_123' };
};

// @filename: query-client.ts
import { QueryClient } from '@tanstack/react-query';
export function makeQueryClient() { return new QueryClient(); }

// @filename: routers/_app.ts
import { initTRPC } from '@trpc/server';
import { z } from 'zod';
const t = initTRPC.create();
export const appRouter = t.router({
  hello: t.procedure.input(z.object({ text: z.string() })).query(({ input }) => ({
    greeting: `hello ${input.text}`,
  })),
});
export type AppRouter = typeof appRouter;

// @filename: server.tsx
// ---cut---
import 'server-only'; // <-- ensure this file cannot be imported from the client

import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import { createTRPCOptionsProxy } from '@trpc/tanstack-react-query';
import type { TRPCQueryOptions } from '@trpc/tanstack-react-query';
import { headers } from 'next/headers';
import { cache } from 'react';
import { createTRPCContext } from './init';
import { makeQueryClient } from './query-client';
import { appRouter } from './routers/_app';

// IMPORTANT: Create a stable getter for the query client that
//            will return the same client during the same request.
export const getQueryClient = cache(makeQueryClient);

const createContext = async () =>
  createTRPCContext({ headers: await headers() });

export const trpc = createTRPCOptionsProxy({
  ctx: createContext,
  router: appRouter,
  queryClient: getQueryClient,
});
// If your router is on a separate server, pass a client instead:
// createTRPCOptionsProxy({
//   client: createTRPCClient({ links: [httpLink({ url: '...' })] }),
//   queryClient: getQueryClient,
// });

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

export const caller = appRouter.createCaller(createContext);
```

### 7. Make API requests

You're all set! You can now prefetch queries in server components and consume them in client components.

:::tip
To avoid repeating the procedure and input in client components, start queries with `unstable_$prefetch` or `unstable_$ensure` and pass the returned handles down. See [Prefetching with handles](/docs/client/tanstack-react-query/handles#nextjs-app-router).
:::

```twoslash include app-router
// @jsx: react-jsx
// @target: esnext
// @module: esnext
// @paths: {"~/*": ["./src/*"]}
// @filename: trpc/routers/_app.ts
import { initTRPC } from '@trpc/server';
import { z } from 'zod';
const t = initTRPC.create();
export const appRouter = t.router({
  hello: t.procedure
    .input(z.object({ text: z.string() }))
    .query(({ input }) => ({ greeting: `hello ${input.text}` })),
});
export type AppRouter = typeof appRouter;

// @filename: trpc/query-client.ts
import { QueryClient } from '@tanstack/react-query';
export function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { staleTime: 30 * 1000 } } });
}

// @filename: trpc/client.tsx
import { createTRPCContext } from '@trpc/tanstack-react-query';
import type { AppRouter } from './routers/_app';
export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();

// @filename: trpc/server.tsx
import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import { createTRPCOptionsProxy, type TRPCQueryOptions } from '@trpc/tanstack-react-query';
import { cache } from 'react';
import { makeQueryClient } from './query-client';
import { appRouter } from './routers/_app';
export const getQueryClient = cache(makeQueryClient);
export const trpc = createTRPCOptionsProxy({
  ctx: {},
  router: appRouter,
  queryClient: getQueryClient,
});
export function HydrateClient(props: { children: React.ReactNode }) {
  return (
    <HydrationBoundary state={dehydrate(getQueryClient())}>
      {props.children}
    </HydrationBoundary>
  );
}
export function prefetch<T extends ReturnType<TRPCQueryOptions<any>>>(queryOptions: T) {
  void getQueryClient().prefetchQuery(queryOptions);
}
export const caller = appRouter.createCaller({});
```

#### Prefetching in a Server Component

`prefetch` starts the query without awaiting it, and `HydrateClient` sends it to the client still pending, so Next.js streams the result in when it resolves. Read a prefetch you don't `await` with `useSuspenseQuery` ([Leveraging Suspense](#leveraging-suspense)): with `useQuery`, the server can render the loading state while the browser already has the data, and React reports a hydration mismatch. For a component on `useQuery`, like the one below, wait for the data instead: `await getQueryClient().prefetchQuery(…)`.

```tsx twoslash title='app/page.tsx'
// @include: app-router
// @filename: app/client-greeting.tsx
export function ClientGreeting() {
  return <div>Hello</div>;
}

// @filename: app/page.tsx
// ---cut---
import { getQueryClient, HydrateClient, trpc } from '~/trpc/server';
import { ClientGreeting } from './client-greeting';

export default async function Home() {
  await getQueryClient().prefetchQuery(trpc.hello.queryOptions({ text: 'world' }));

  return (
    <HydrateClient>
      <ClientGreeting />
    </HydrateClient>
  );
}
```

#### Using data in a Client Component

```tsx twoslash title='app/client-greeting.tsx'
// @include: app-router
// @filename: app/client-greeting.tsx
// ---cut---
'use client';

// <-- hooks can only be used in client components
import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '~/trpc/client';

export function ClientGreeting() {
  const trpc = useTRPC();
  const greetingQuery = useQuery(trpc.hello.queryOptions({ text: 'world' }));

  switch (greetingQuery.status) {
    case 'pending':
      return <div>Loading...</div>;
    case 'error':
      return <div>Error: {greetingQuery.error.message}</div>;
    case 'success':
      return <div>{greetingQuery.data.greeting}</div>;
  }
}
```

## Leveraging Suspense

You may prefer handling loading and error states using Suspense and Error Boundaries. You can do this by using the `useSuspenseQuery` hook.

```tsx twoslash title='app/page.tsx'
// @include: app-router
// @filename: app/client-greeting.tsx
export function ClientGreeting() {
  return <div>Hello</div>;
}

// @filename: app/page.tsx
// ---cut---
import { HydrateClient, prefetch, trpc } from '~/trpc/server';
import { Suspense } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
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

```tsx twoslash title='app/client-greeting.tsx'
// @include: app-router
// @filename: app/client-greeting.tsx
// ---cut---
'use client';

import { useSuspenseQuery } from '@tanstack/react-query';
import { useTRPC } from '~/trpc/client';

export function ClientGreeting() {
  const trpc = useTRPC();
  const greetingQuery = useSuspenseQuery(trpc.hello.queryOptions({ text: 'world' }));
  return <div>{greetingQuery.data.greeting}</div>;
}
```

## Getting data in a Server Component

If you need access to the data in a server component, we recommend using the server `caller` from [`trpc/server.tsx`](#6-create-a-trpc-caller-for-server-components) directly. Please note that this method is detached from your query client and does not
store the data in the cache. This means that you cannot use the data in a server component and expect it to be available in the client. This is
intentional and explained in more detail in the [Advanced Server Rendering](https://tanstack.com/query/latest/docs/framework/react/guides/advanced-ssr#data-ownership-and-revalidation)
guide.

```tsx twoslash title='app/page.tsx'
// @include: app-router
// @filename: app/page.tsx
// ---cut---
import { caller } from '~/trpc/server';

export default async function Home() {
  const greeting = await caller.hello({ text: 'world' });
  //    ^?

  return <div>{greeting.greeting}</div>;
}
```

If you **really** need to use the data both on the server as well as inside client components and understand the tradeoffs explained in the
[Advanced Server Rendering](https://tanstack.com/query/latest/docs/framework/react/guides/advanced-ssr#data-ownership-and-revalidation)
guide, you can use `fetchQuery` instead of `prefetch` to have the data both on the server as well as hydrating it down to the client:

```tsx twoslash title='app/page.tsx'
// @include: app-router
// @filename: app/client-greeting.tsx
export function ClientGreeting() {
  return <div>Hello</div>;
}

// @filename: app/page.tsx
// ---cut---
import { getQueryClient, HydrateClient, trpc } from '~/trpc/server';
import { ClientGreeting } from './client-greeting';

export default async function Home() {
  const queryClient = getQueryClient();
  const greeting = await queryClient.fetchQuery(trpc.hello.queryOptions({ text: 'world' }));

  // Do something with greeting on the server

  return (
    <HydrateClient>
      <ClientGreeting />
    </HydrateClient>
  );
}
```

## Common mistakes

- **Exporting only `POST` from the route handler.** Queries are sent as `GET` (unless the link sets `methodOverride: 'POST'`) and mutations as `POST`, so a missing export answers `405 Method Not Allowed`.
- **Importing `trpc/server.tsx` into a client component.** `server-only` makes that a build error. Client components (`'use client'`) use `useTRPC()` from `trpc/client.tsx`.
- **Prefetching with a different input than the client uses.** The input is part of the query key, so the client misses the prefetched data and fetches again.
- **Prefetching inside `HydrateClient`.** It dehydrates the cache when it renders, so it only sends queries prefetched before that. A nested server component that prefetches needs its own `HydrateClient`.
- **Sharing one `QueryClient` across requests.** On the server, only use the per-request `getQueryClient()` from `cache()`.
- **Confusing the two `createTRPCContext`s.** The one in `trpc/init.ts` creates the context your procedures get; the one from `@trpc/tanstack-react-query` creates the React provider and hooks.

## Next steps

- Learn about [Server Actions](/docs/client/nextjs/server-actions) for defining tRPC-powered server actions
- Learn about [queries, mutations and invalidation](/docs/client/tanstack-react-query/usage) in client components
- Explore [server-side calls](/docs/server/server-side-calls) for more advanced server-side patterns
