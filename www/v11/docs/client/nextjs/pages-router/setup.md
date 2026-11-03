---
id: setup
title: Set up with Next.js Pages Router
sidebar_label: "Pages Router"
slug: /client/nextjs/pages-router/setup
section: "Client Usage"
parent: "client/nextjs"
order: 70
skill:
  name: nextjs-pages-router
  package: "@trpc/next"
  type: framework
  requires:
    - server-setup
    - client-setup
  description: Set up tRPC in Next.js Pages Router with createNextApiHandler
    and @trpc/tanstack-react-query. Covers a QueryClient factory, TRPCProvider,
    QueryClientProvider and HydrationBoundary in _app, useTRPC() with useQuery
    in pages, and prefetching a page's queries in getServerSideProps or
    getStaticProps with createTRPCOptionsProxy and dehydrate, returned as
    trpcState. Replaces the deprecated createTRPCNext, withTRPC, ssr true,
    ssrPrepass and createServerSideHelpers.
  include:
    - client/nextjs/pages-router/server-side-helpers
    - client/nextjs#choosing-between-app-router-and-pages-router
  references:
    - client/nextjs/pages-router/ssr
    - client/nextjs/pages-router/ssg
    - server/adapters/nextjs
    - client/nextjs/pages-router/aborting-procedure-calls
    - client/tanstack-react-query/usage
    - client/tanstack-react-query/migrating
---

:::caution
This guide is for the **Next.js Pages Router**. If you are using the **Next.js App Router**, see the [App Router setup guide](/docs/client/nextjs/app-router-setup) instead.
:::

The Pages Router uses the same client as the App Router: the [TanStack React Query integration](/docs/client/tanstack-react-query) (`@trpc/tanstack-react-query`). You mount its provider in `_app`, and prefetch a page's queries in `getServerSideProps` or `getStaticProps` when you want them in the first HTML.

:::warning Deprecated
`createTRPCNext`, `withTRPC` and `ssr: true` from `@trpc/next` are deprecated. They're built on the [classic React Query integration](/docs/client/react), which only gets bug fixes and will be removed in the next major version of tRPC. To move an existing app, see [Moving from `createTRPCNext`](#moving-from-createtrpcnext).
:::

## Recommended file structure

We recommend a file structure like this one, although it is not enforced by tRPC. The rest of this page will take you through the process of adding tRPC in to this structure.

```graphql
.
├── prisma  # <-- if prisma is added
│   └── [..]
├── src
│   ├── pages
│   │   ├── _app.tsx  # <-- mount the providers here
│   │   ├── api
│   │   │   └── trpc
│   │   │       └── [trpc].ts  # <-- tRPC HTTP handler
│   │   └── [..]
│   ├── server
│   │   ├── routers
│   │   │   ├── _app.ts  # <-- main app router
│   │   │   ├── post.ts  # <-- sub routers
│   │   │   └── [..]
│   │   ├── context.ts   # <-- create app context
│   │   └── trpc.ts      # <-- procedure helpers
│   └── utils
│       ├── query-client.ts  # <-- shared QueryClient factory
│       └── trpc.ts          # <-- your typesafe tRPC hooks
└── [..]
```

## Add tRPC to existing Next.js project

### 1. Install deps

```package-install
@trpc/server @trpc/client @trpc/tanstack-react-query @tanstack/react-query@latest zod
```

### 2. Enable strict mode

If you want to use Zod for input validation, make sure you have enabled strict mode in your `tsconfig.json`:

```diff title="tsconfig.json"
"compilerOptions": {
+   "strict": true
}
```

If strict mode is too harsh, you'll at least want to enable `strictNullChecks`:

```diff title="tsconfig.json"
"compilerOptions": {
+   "strictNullChecks": true
}
```

### 3. Create a tRPC router

Initialize your tRPC backend in `src/server/trpc.ts` using the `initTRPC` function, and create your first router. We're going to make a simple "hello world" router and procedure here - but for deeper information on creating your tRPC API you should refer to:

- the [Quickstart guide](/docs/quickstart) and [Backend usage docs](/docs/server/overview) for tRPC information
- the [Next.js Adapter docs](/docs/server/adapters/nextjs) for mounting tRPC within your Next.js server.

<details>
<summary>View sample backend</summary>

```ts twoslash title='server/trpc.ts'
import { initTRPC } from '@trpc/server';

// Avoid exporting the entire t-object
// since it's not very descriptive.
// For instance, the use of a t variable
// is common in i18n libraries.
const t = initTRPC.create();

// Base router and procedure helpers
export const router = t.router;
export const procedure = t.procedure;
```

<br />

```ts twoslash title='server/routers/_app.ts'
// @filename: server/trpc.ts
import { initTRPC } from '@trpc/server';
const t = initTRPC.create();
export const router = t.router;
export const procedure = t.procedure;

// @filename: server/routers/_app.ts
// ---cut---
import { z } from 'zod';
import { procedure, router } from '../trpc';

export const appRouter = router({
  hello: procedure
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

```ts twoslash title='pages/api/trpc/[trpc].ts'
// @filename: server/routers/_app.ts
import { initTRPC } from '@trpc/server';
const t = initTRPC.create();
export const appRouter = t.router({});
export type AppRouter = typeof appRouter;

// @filename: pages/api/trpc/[trpc].ts
// ---cut---
import * as trpcNext from '@trpc/server/adapters/next';
import { appRouter } from '../../../server/routers/_app';

// export API handler
// @link https://trpc.io/docs/server/adapters
export default trpcNext.createNextApiHandler({
  router: appRouter,
  createContext: () => ({}),
});
```

</details>

:::note
The backend above is using the [recommended file structure](#recommended-file-structure), but you can keep it simple and put everything in [an API handler directly](https://github.com/trpc/trpc/blob/db643ba428f4eaf75fcfeef13a53d29f446ee567/examples/next-minimal-starter/src/pages/api/trpc/%5Btrpc%5D.ts) if you prefer.
:::

### 4. Create a Query Client factory

Create `utils/query-client.ts`. Both `_app` and the pages that prefetch on the server use it.

```ts twoslash title='utils/query-client.ts'
import { QueryClient } from '@tanstack/react-query';

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // keep server-rendered data fresh for a while, so the
        // client doesn't fetch it again as soon as the page loads
        staleTime: 30 * 1000,
      },
    },
  });
}
```

### 5. Create tRPC hooks

Use `createTRPCContext` to create a provider and a `useTRPC` hook from your API's type signature.

```ts twoslash title='utils/trpc.ts'
// @filename: server/routers/_app.ts
import { initTRPC } from '@trpc/server';
const t = initTRPC.create();
export const appRouter = t.router({});
export type AppRouter = typeof appRouter;

// @filename: utils/trpc.ts
// ---cut---
import { createTRPCContext } from '@trpc/tanstack-react-query';
import type { AppRouter } from '../server/routers/_app';

export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();
```

### 6. Configure `_app.tsx`

Create the query client and the tRPC client once per app, and wrap every page in the providers. `HydrationBoundary` puts the queries a page prefetched on the server, which it returns as `trpcState`, into the cache.

```tsx twoslash title='pages/_app.tsx'
// @jsx: react-jsx
// @filename: server/routers/_app.ts
import { initTRPC } from '@trpc/server';
const t = initTRPC.create();
export const appRouter = t.router({});
export type AppRouter = typeof appRouter;

// @filename: utils/query-client.ts
import { QueryClient } from '@tanstack/react-query';
export function makeQueryClient() { return new QueryClient(); }

// @filename: utils/trpc.ts
import { createTRPCContext } from '@trpc/tanstack-react-query';
import type { AppRouter } from '../server/routers/_app';
export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();

// @filename: pages/_app.tsx
// ---cut---
import type { DehydratedState } from '@tanstack/react-query';
import { HydrationBoundary, QueryClientProvider } from '@tanstack/react-query';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { AppProps } from 'next/app';
import { useState } from 'react';
import type { AppRouter } from '../server/routers/_app';
import { makeQueryClient } from '../utils/query-client';
import { TRPCProvider } from '../utils/trpc';

export default function App({
  Component,
  pageProps,
}: AppProps<{ trpcState?: DehydratedState }>) {
  const [queryClient] = useState(makeQueryClient);
  const [trpcClient] = useState(() =>
    createTRPCClient<AppRouter>({
      links: [
        httpBatchLink({
          // transformer: superjson, <-- if you use a data transformer
          url: '/api/trpc',
        }),
      ],
    }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        <HydrationBoundary state={pageProps.trpcState}>
          <Component {...pageProps} />
        </HydrationBoundary>
      </TRPCProvider>
    </QueryClientProvider>
  );
}
```

The client only calls the API from the browser, so a relative URL is enough. On the server, pages call your procedures directly, as [Server-Side Rendering](./ssr.md) shows.

### 7. Make an API request

You're all set! Get the options for a query from `useTRPC()`, and pass them to TanStack React Query's hooks. For more, see [TanStack React Query usage](/docs/client/tanstack-react-query/usage).

```tsx twoslash title='pages/index.tsx'
// @jsx: react-jsx
// @filename: server/routers/_app.ts
import { initTRPC } from '@trpc/server';
import { z } from 'zod';
const t = initTRPC.create();
export const appRouter = t.router({
  hello: t.procedure.input(z.object({ text: z.string() })).query(({ input }) => ({ greeting: `hello ${input.text}` })),
});
export type AppRouter = typeof appRouter;

// @filename: utils/trpc.ts
import { createTRPCContext } from '@trpc/tanstack-react-query';
import type { AppRouter } from '../server/routers/_app';
export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();

// @filename: pages/index.tsx
// ---cut---
import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '../utils/trpc';

export default function IndexPage() {
  const trpc = useTRPC();
  const helloQuery = useQuery(trpc.hello.queryOptions({ text: 'client' }));

  switch (helloQuery.status) {
    case 'pending':
      return <p>Loading...</p>;
    case 'error':
      return <p>Error: {helloQuery.error.message}</p>;
    case 'success':
      return <p>{helloQuery.data.greeting}</p>;
  }
}
```

This page fetches in the browser. To put the data in the first HTML, prefetch it in [`getServerSideProps`](./ssr.md) or [`getStaticProps`](./ssg.md).

## Using a data transformer

Next.js sends page props as JSON, and checks that they are. So without a transformer, the queries you prefetch can only hold JSON values, in their inputs as well as their results: a `Date` or an `undefined` field makes `getServerSideProps` fail.

If your router uses a [data transformer](/docs/server/data-transformers) such as superjson, run the whole prefetched cache through it. In `getServerSideProps` or `getStaticProps`, return `trpcState: superjson.serialize(dehydrate(queryClient))`, as the [SSG example](./ssg.md#fetch-data-in-getstaticprops) does. Then read it back with a hook:

```ts twoslash title='utils/use-trpc-state.ts'
import type { DehydratedState } from '@tanstack/react-query';
import { useMemo } from 'react';
import superjson from 'superjson';

export type TRPCState = ReturnType<typeof superjson.serialize>;

export function useTRPCState(trpcState: TRPCState | undefined) {
  return useMemo(
    () => trpcState && superjson.deserialize<DehydratedState>(trpcState),
    [trpcState],
  );
}
```

In the `_app` from [step 6](#6-configure-_apptsx), change three things:

- Type the props as `AppProps<{ trpcState?: TRPCState }>`.
- Pass `transformer: superjson` to `httpBatchLink`.
- Call `const trpcState = useTRPCState(pageProps.trpcState)`, and pass `trpcState` to `HydrationBoundary` instead of `pageProps.trpcState`.

## Moving from `createTRPCNext`

`createTRPCNext` combined the classic React Query hooks with a higher-order component for `_app`. Here's what replaces each part:

| `@trpc/next`                                    | `@trpc/tanstack-react-query`                                                                                                           |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `createTRPCNext<AppRouter>({ config })`         | `createTRPCContext<AppRouter>()`, plus a `createTRPCClient` with your links in `_app`                                                  |
| `trpc.withTRPC(MyApp)`                          | `QueryClientProvider`, `TRPCProvider` and `HydrationBoundary` in `_app`, as in [step 6](#6-configure-_apptsx)                          |
| `trpc.post.byId.useQuery(input)`                | `useQuery(trpc.post.byId.queryOptions(input))`, with `trpc` from `useTRPC()`                                                           |
| `trpc.useUtils()`                               | `useQueryClient()` with `trpc.post.byId.queryKey()` or `queryFilter()`                                                                 |
| `ssr: true` and `ssrPrepass`                    | No direct replacement. Prefetch each page's queries in [`getServerSideProps`](./ssr.md)                                                |
| `responseMeta`                                  | Set the status and headers in [`getServerSideProps`](./ssr.md#set-the-status-and-cache-headers)                                        |
| `config({ ctx })` forwarding the request headers | Pass a context built from `context.req` to `createTRPCOptionsProxy` in `getServerSideProps`                                           |
| `createServerSideHelpers` (`@trpc/react-query/server`) | `createTRPCOptionsProxy` with a query client, then `dehydrate(queryClient)`. See [Server-Side Helpers](./server-side-helpers.md) |
| `abortOnUnmount` in `config`                    | `trpc: { abortOnUnmount: true }` on each query. See [Aborting Procedure Calls](./aborting-procedure-calls.md)                          |
| `queryClientConfig`                             | The options you pass to `new QueryClient()` in `makeQueryClient`                                                                       |

The [migration guide](/docs/client/tanstack-react-query/migrating) covers the hooks in detail, and has a codemod for them that's still a work in progress.

`ssr: true` rendered the page over and over until no query was fetching. With `getServerSideProps`, you pick which queries run on the server, and Next.js keeps [Automatic Static Optimization](https://nextjs.org/docs/pages/building-your-application/rendering/automatic-static-optimization) for pages that don't need them.

## Common mistakes

- **Sharing one `QueryClient` across requests.** Make it in `_app` with `useState`, and make a new one in each `getServerSideProps` or `getStaticProps`. A query client at module scope would hand one user's data to the next.
- **Returning the dehydrated state under another key.** `_app` reads `pageProps.trpcState`, so return `{ props: { trpcState: dehydrate(queryClient) } }`. Otherwise the client fetches every query again.
- **Prefetching with a different input than the page uses.** The input is part of the query key, so the page misses the prefetched data and fetches again.
- **Prefetching values JSON can't hold.** Next.js sends page props as JSON, so a `Date` or an `undefined` field in a query's input or result makes the page fail. Run the prefetched cache through a [data transformer](#using-a-data-transformer).
- **Mixing in App Router setup.** `HydrateClient` and `server-only` are for the App Router. In the Pages Router, prefetch in `getServerSideProps` or `getStaticProps` instead.

## Next steps

Browse the rest of the docs to learn more about things like [authorization](/docs/server/authorization), [middlewares](/docs/server/middlewares), and [error handling](/docs/server/error-handling).

You can also find information about [queries, mutations and invalidation](/docs/client/tanstack-react-query/usage) in the TanStack React Query docs.
