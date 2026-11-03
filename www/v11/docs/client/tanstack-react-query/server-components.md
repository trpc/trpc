---
id: server-components
title: Set up with React Server Components
sidebar_label: Server Components
description: Prefetch tRPC queries in React Server Components, hydrate them into client components, and call procedures directly on the server
slug: /client/tanstack-react-query/server-components
section: "Client Usage"
parent: "client/tanstack-react-query"
order: 51
---

:::tip
**Using Next.js?** See the dedicated [Next.js App Router setup guide](/docs/client/nextjs/app-router-setup) for a streamlined walkthrough tailored to Next.js.
:::

This guide is an overview of how one may use tRPC with a React Server Components (RSC) framework such as Next.js App Router.
Be aware that RSC on its own solves a lot of the same problems tRPC was designed to solve, so you may not need tRPC at all.

There is also not a one-size-fits-all way to integrate tRPC with RSCs, so see this guide as a starting point and adjust it
to your needs and preferences.

:::info
If you're looking for how to use tRPC with Server Actions, see the [Server Actions guide](/docs/client/nextjs/server-actions).
:::

:::caution
Please read React Query's [Advanced Server Rendering](https://tanstack.com/query/latest/docs/framework/react/guides/advanced-ssr) docs before proceeding to understand the different types of server rendering
and what footguns to avoid.
:::

## Add tRPC to existing projects

### 1. Install deps

```package-install
@trpc/server @trpc/client @trpc/tanstack-react-query @tanstack/react-query@latest zod client-only server-only
```

### 2. Create a tRPC router

Initialize your tRPC backend in `trpc/init.ts` using the `initTRPC` function, and create your first router. We're going to make a simple "hello world" router and procedure here - but for deeper information on creating your tRPC API you should refer to the [Quickstart guide](/docs/quickstart) and [Backend usage docs](/docs/server/overview) for tRPC information.

:::info
The file names used here are not enforced by tRPC. You may use any file structure you wish.
:::

<details>
<summary>View sample backend</summary>

```ts twoslash title='trpc/init.ts'
import { initTRPC } from '@trpc/server';
import { cache } from 'react';

export const createTRPCContext = cache(async () => {
  /**
   * @see: https://trpc.io/docs/server/context
   */
  return { userId: 'user_123' };
});

// Avoid exporting the entire t-object
// since it's not very descriptive.
// For instance, the use of a t variable
// is common in i18n libraries.
const t = initTRPC.create({
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

<br />

:::note
The backend adapter depends on your framework and how it sets up API routes. The following example sets up GET and POST routes at `/api/trpc/*` using the [fetch adapter](../../server/adapters/fetch.md) in Next.js.
:::

```ts twoslash title='app/api/trpc/[trpc]/route.ts'
// @filename: trpc/init.ts
import { initTRPC } from '@trpc/server';
const t = initTRPC.create();
export const createTRPCContext = async () => ({ userId: 'user_123' });
export const createTRPCRouter = t.router;
export const baseProcedure = t.procedure;

// @filename: trpc/routers/_app.ts
import { initTRPC } from '@trpc/server';
import { z } from 'zod';
const t = initTRPC.create();
export const appRouter = t.router({
  hello: t.procedure.input(z.object({ text: z.string() })).query((opts) => ({
    greeting: `hello ${opts.input.text}`,
  })),
});
export type AppRouter = typeof appRouter;

// @filename: app/api/trpc/[trpc]/route.ts
// ---cut---
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { createTRPCContext } from '../../../../trpc/init';
import { appRouter } from '../../../../trpc/routers/_app';

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: createTRPCContext,
  });

export { handler as GET, handler as POST };
```

</details>

### 3. Create a Query Client factory

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

### 4. Create a tRPC client for Client Components

The `trpc/client.tsx` is the entrypoint when consuming your tRPC API from client components. In here, import the **type definition** of
your tRPC router and create typesafe hooks using `createTRPCContext`. We'll also export our context provider from this file.

```tsx twoslash title='trpc/client.tsx'
// @target: esnext
// @jsx: react-jsx
// @filename: trpc/init.ts
import { initTRPC } from '@trpc/server';
const t = initTRPC.create();
export const createTRPCRouter = t.router;
export const baseProcedure = t.procedure;

// @filename: trpc/routers/_app.ts
import { z } from 'zod';
import { baseProcedure, createTRPCRouter } from '../init';
export const appRouter = createTRPCRouter({
  hello: baseProcedure.input(z.object({ text: z.string() })).query((opts) => ({
    greeting: `hello ${opts.input.text}`,
  })),
});
export type AppRouter = typeof appRouter;

// @filename: trpc/query-client.ts
import { QueryClient } from '@tanstack/react-query';
export function makeQueryClient() {
  return new QueryClient();
}

// @filename: trpc/client.tsx
// ---cut---
'use client';

// ^-- to make sure we can mount the Provider from a server component
import type { QueryClient } from '@tanstack/react-query';
import { QueryClientProvider } from '@tanstack/react-query';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import {
  createTRPCContext,
  type TRPCOptionsProxy,
} from '@trpc/tanstack-react-query';
import { useState } from 'react';
import { makeQueryClient } from './query-client';
import type { AppRouter } from './routers/_app';

export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();
// Types the query handles that client components take as props
export type TRPC = TRPCOptionsProxy<AppRouter>;

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

Mount the provider in the root of your application (e.g. `app/layout.tsx` when using Next.js).

### 5. Create a tRPC caller for Server Components

To start queries from server components, we create a proxy from our router. You can also pass in a client if your router is on a separate server. We'll also add a `HydrateClient` component that sends the queries a request has started to client components.

```tsx twoslash title='trpc/server.tsx'
// @filename: trpc/init.ts
import { initTRPC } from '@trpc/server';
const t = initTRPC.create();
export const createTRPCContext = async () => ({ userId: 'user_123' });
export const createTRPCRouter = t.router;
export const baseProcedure = t.procedure;

// @filename: trpc/query-client.ts
import { QueryClient } from '@tanstack/react-query';
export function makeQueryClient() { return new QueryClient(); }

// @filename: trpc/routers/_app.ts
import { initTRPC } from '@trpc/server';
import { z } from 'zod';
const t = initTRPC.create();
export const appRouter = t.router({
  hello: t.procedure.input(z.object({ text: z.string() })).query((opts) => ({
    greeting: `hello ${opts.input.text}`,
  })),
});
export type AppRouter = typeof appRouter;

// @filename: server-only.d.ts
declare module 'server-only' {}
// @filename: trpc/server.tsx
// ---cut---
import 'server-only'; // <-- ensure this file cannot be imported from the client

import {
  createTRPCOptionsProxy,
  unstable_createHydrateClient,
} from '@trpc/tanstack-react-query';
import { createTRPCClient, httpLink } from '@trpc/client';
import { cache } from 'react';
import { createTRPCContext } from './init';
import { makeQueryClient } from './query-client';
import { appRouter } from './routers/_app';
import type { AppRouter } from './routers/_app';

// IMPORTANT: Create a stable getter for the query client that
//            will return the same client during the same request.
export const getQueryClient = cache(makeQueryClient);

export const trpc = createTRPCOptionsProxy({
  ctx: createTRPCContext,
  router: appRouter,
  queryClient: getQueryClient,
});

// If your router is on a separate server, pass a client:
createTRPCOptionsProxy<AppRouter>({
  client: createTRPCClient<AppRouter>({
    links: [httpLink({ url: '...' })],
  }),
  queryClient: getQueryClient,
});

// Sends the queries started so far in this request to client components,
// each one once, including pending ones, which stream in as they settle
export const HydrateClient = unstable_createHydrateClient(getQueryClient);
```

## Using your API

Now you can use your tRPC API in your app. Start each query in a server component high up the tree, and pass the **handle** it returns to the client component that shows it. You may be familiar with this
concept as "render as you fetch" commonly implemented as loaders: the request fires as soon as possible, and the client component reads the query from its handle,
typed from the procedure, without repeating the procedure or its input. See [Prefetching with handles](/docs/client/tanstack-react-query/handles) for the full guide.

:::info
We have prefixed the handle APIs with `unstable_` as they're new, but you're safe to use them! [Read more](/docs/faq#unstable).
:::

```twoslash include rsc
// @jsx: react-jsx
// @target: esnext
// @module: esnext
// @filename: trpc/routers/_app.ts
import { initTRPC } from '@trpc/server';
import { z } from 'zod';
const t = initTRPC.create();
export const appRouter = t.router({
  hello: t.procedure.input(z.object({ text: z.string() })).query((opts) => ({
    greeting: `hello ${opts.input.text}`,
  })),
});
export type AppRouter = typeof appRouter;

// @filename: trpc/query-client.ts
import { QueryClient } from '@tanstack/react-query';
export function makeQueryClient() { return new QueryClient(); }

// @filename: trpc/client.tsx
import { createTRPCContext, type TRPCOptionsProxy } from '@trpc/tanstack-react-query';
import type { AppRouter } from './routers/_app';
export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();
export type TRPC = TRPCOptionsProxy<AppRouter>;

// @filename: trpc/server.tsx
import {
  createTRPCOptionsProxy,
  unstable_createHydrateClient,
} from '@trpc/tanstack-react-query';
import { cache } from 'react';
import { makeQueryClient } from './query-client';
import { appRouter } from './routers/_app';
export const getQueryClient = cache(makeQueryClient);
export const trpc = createTRPCOptionsProxy({
  ctx: async () => ({ userId: 'user_123' }),
  router: appRouter,
  queryClient: getQueryClient,
});
export const HydrateClient = unstable_createHydrateClient(getQueryClient);

// @filename: app/client-greeting-props.ts
import type { unstable_inferQueryHandle } from '@trpc/tanstack-react-query';
import type { TRPC } from '../trpc/client';
export type ClientGreetingProps = {
  greeting: unstable_inferQueryHandle<TRPC['hello']>;
};
```

`unstable_$ensure` waits until the query's data is in the cache, so the page renders with it, and `HydrateClient` sends it to the client. It rejects if the query fails, so you can handle the error on the server:

```tsx twoslash title='app/page.tsx'
// @include: rsc
// @filename: app/client-greeting.tsx
import type { ClientGreetingProps } from './client-greeting-props';
export declare function ClientGreeting(props: ClientGreetingProps): React.ReactNode;

// @filename: app/page.tsx
// ---cut---
import { HydrateClient, trpc } from '../trpc/server';
import { ClientGreeting } from './client-greeting';

export default async function Home() {
  const greeting = await trpc.hello.unstable_$ensure({ text: 'world' });

  return (
    <HydrateClient>
      <div>...</div>
      {/** ... */}
      <ClientGreeting greeting={greeting} />
    </HydrateClient>
  );
}
```

```tsx twoslash title='app/client-greeting.tsx'
// @include: rsc
// @filename: app/client-greeting.tsx
// ---cut---
'use client';

// <-- hooks can only be used in client components
import { useQuery } from '@tanstack/react-query';
import type { unstable_inferQueryHandle } from '@trpc/tanstack-react-query';
import { useTRPC, type TRPC } from '../trpc/client';

export function ClientGreeting(props: {
  greeting: unstable_inferQueryHandle<TRPC['hello']>;
}) {
  const trpc = useTRPC();
  const greeting = useQuery(trpc.unstable_$fromHandle(props.greeting));
  if (!greeting.data) return <div>Loading...</div>;
  return <div>{greeting.data.greeting}</div>;
}
```

After `unstable_$ensure`, `greeting.data` is there on the first render. Keep the loading state anyway: the cache can lose the data later, for example after `queryClient.resetQueries()`, and the component then loads it again. See [When the cache loses the data](/docs/client/tanstack-react-query/handles#cache-loses-data).

`HydrateClient` sends each query once per request, so nested server components can each render their own. See [`HydrateClient`](/docs/client/tanstack-react-query/handles#hydrate-client).

### Streaming with Suspense

Waiting for the query delays the page's HTML until the server has the data. To send the HTML at once and stream the data in as it becomes available, start the query with `unstable_$prefetch`. It returns the handle without waiting,
and `HydrateClient` sends the query to the client still pending. This leverages your framework's streaming, and optimizes both the time to first byte in the browser and the data fetch time.

Read the handle with `useSuspenseQuery`, and handle loading and error states with Suspense and Error Boundaries:

```tsx twoslash title='app/page.tsx'
// @include: rsc
// @filename: app/client-greeting.tsx
import type { ClientGreetingProps } from './client-greeting-props';
export declare function ClientGreeting(props: ClientGreetingProps): React.ReactNode;

// @filename: app/page.tsx
// ---cut---
import { HydrateClient, trpc } from '../trpc/server';
import { Suspense } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { ClientGreeting } from './client-greeting';

export default async function Home() {
  const greeting = trpc.hello.unstable_$prefetch({ text: 'world' });

  return (
    <HydrateClient>
      <div>...</div>
      {/** ... */}
      <ErrorBoundary fallback={<div>Something went wrong</div>}>
        <Suspense fallback={<div>Loading...</div>}>
          <ClientGreeting greeting={greeting} />
        </Suspense>
      </ErrorBoundary>
    </HydrateClient>
  );
}
```

```tsx twoslash title='app/client-greeting.tsx'
// @include: rsc
// @filename: app/client-greeting.tsx
// ---cut---
'use client';

import { useSuspenseQuery } from '@tanstack/react-query';
import type { unstable_inferQueryHandle } from '@trpc/tanstack-react-query';
import { useTRPC, type TRPC } from '../trpc/client';

export function ClientGreeting(props: {
  greeting: unstable_inferQueryHandle<TRPC['hello']>;
}) {
  const trpc = useTRPC();
  const { data } = useSuspenseQuery(trpc.unstable_$fromHandle(props.greeting));
  return <div>{data.greeting}</div>;
}
```

To wait for some queries and stream others on the same page, start every query first, then await: see [Combining both](/docs/client/tanstack-react-query/handles#combining-both).

### Getting data in a server component

If you need access to the data in a server component, we recommend creating a server caller and using it directly. Please note that this method is detached from your query client and does not
store the data in the cache. This means that you cannot use the data in a server component and expect it to be available in the client. This is
intentional and explained in more detail in the [Advanced Server Rendering](https://tanstack.com/query/latest/docs/framework/react/guides/advanced-ssr#data-ownership-and-revalidation)
guide.

```tsx twoslash title='trpc/server.tsx'
// @filename: trpc/init.ts
import { initTRPC } from '@trpc/server';
const t = initTRPC.create();
export const createTRPCContext = async () => ({ userId: 'user_123' });

// @filename: trpc/routers/_app.ts
import { initTRPC } from '@trpc/server';
import { z } from 'zod';
const t = initTRPC.create();
export const appRouter = t.router({
  hello: t.procedure.input(z.object({ text: z.string() })).query((opts) => ({
    greeting: `hello ${opts.input.text}`,
  })),
});
export type AppRouter = typeof appRouter;

// @filename: trpc/server.tsx
import { createTRPCContext } from './init';
import { appRouter } from './routers/_app';
// ---cut---
// ...
export const caller = appRouter.createCaller(createTRPCContext);
```

```tsx twoslash title='app/page.tsx'
// @jsx: react-jsx
// @filename: trpc/init.ts
import { initTRPC } from '@trpc/server';
const t = initTRPC.create();
export const createTRPCContext = async () => ({ userId: 'user_123' });

// @filename: trpc/routers/_app.ts
import { initTRPC } from '@trpc/server';
import { z } from 'zod';
const t = initTRPC.create();
export const appRouter = t.router({
  hello: t.procedure.input(z.object({ text: z.string() })).query((opts) => ({
    greeting: `hello ${opts.input.text}`,
  })),
});
export type AppRouter = typeof appRouter;

// @filename: trpc/server.tsx
import { createTRPCContext } from './init';
import { appRouter } from './routers/_app';
export const caller = appRouter.createCaller(createTRPCContext);

// @filename: app/page.tsx
// ---cut---
import { caller } from '../trpc/server';

export default async function Home() {
  const greeting = await caller.hello({ text: 'world' });
  //    ^? { greeting: string }

  return <div>{greeting.greeting}</div>;
}
```

If you **really** need to use the data both on the server as well as inside client components and understand the tradeoffs explained in the
[Advanced Server Rendering](https://tanstack.com/query/latest/docs/framework/react/guides/advanced-ssr#data-ownership-and-revalidation)
guide, read it from the query client after `unstable_$ensure`. `ensureQueryData` returns it without another request, and the client component still gets the handle:

```tsx twoslash title='app/page.tsx'
// @include: rsc
// @filename: app/client-greeting.tsx
import type { ClientGreetingProps } from './client-greeting-props';
export declare function ClientGreeting(props: ClientGreetingProps): React.ReactNode;

// @filename: app/page.tsx
// ---cut---
import { getQueryClient, HydrateClient, trpc } from '../trpc/server';
import { ClientGreeting } from './client-greeting';

export default async function Home() {
  const greeting = await trpc.hello.unstable_$ensure({ text: 'world' });
  const data = await getQueryClient().ensureQueryData(
    trpc.unstable_$fromHandle(greeting),
  );

  // Do something with data on the server

  return (
    <HydrateClient>
      <div>...</div>
      {/** ... */}
      <ClientGreeting greeting={greeting} />
    </HydrateClient>
  );
}
```
