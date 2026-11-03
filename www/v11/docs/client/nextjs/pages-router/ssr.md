---
id: ssr
title: Server-Side Rendering
sidebar_label: Server-Side Rendering (SSR)
description: "Prefetch a page's tRPC queries in getServerSideProps with createTRPCOptionsProxy, build the context from the request, and set the status and cache headers"
slug: /client/nextjs/pages-router/ssr
section: "Client Usage"
parent: "client/nextjs/pages-router/setup"
order: 71
---

To render a page's data on the server, prefetch its queries in `getServerSideProps`. Next.js then renders the page with the data in the cache, so it's in the first HTML, and the client doesn't fetch it again.

This page builds on the [Pages Router setup](./setup.md).

:::warning Deprecated
`ssr: true` and `ssrPrepass` from `@trpc/next` are deprecated, along with `createTRPCNext`. They rendered every page over and over until no query was fetching. Nothing does that for you now: prefetch each page's queries in `getServerSideProps` instead. You choose what runs on the server, and pages without `getServerSideProps` stay static.
:::

## Prefetch in `getServerSideProps`

In `getServerSideProps`, make a query client and a tRPC proxy that calls your router directly, with no HTTP request. Prefetch the queries the page needs, and return the cache as `trpcState`. `_app`'s `HydrationBoundary` puts it into the client's cache.

```tsx twoslash title='pages/posts/[id].tsx'
// @jsx: react-jsx
// @filename: server/auth.ts
export declare function getUserFromCookie(cookie: string | undefined): Promise<{ id: string } | null>;

// @filename: server/context.ts
import type { IncomingHttpHeaders } from 'node:http';
import { getUserFromCookie } from './auth';
export async function createContext(opts: { headers: IncomingHttpHeaders }) {
  return { user: await getUserFromCookie(opts.headers.cookie) };
}

// @filename: server/routers/_app.ts
import { initTRPC } from '@trpc/server';
import { z } from 'zod';
import type { createContext } from '../context';
const t = initTRPC.context<Awaited<ReturnType<typeof createContext>>>().create();
export const appRouter = t.router({
  post: t.router({
    byId: t.procedure
      .input(z.object({ id: z.string() }))
      .query((opts) => ({ id: opts.input.id, title: 'Example Post', text: 'Hello world' })),
  }),
});
export type AppRouter = typeof appRouter;

// @filename: utils/query-client.ts
import { QueryClient } from '@tanstack/react-query';
export function makeQueryClient() { return new QueryClient(); }

// @filename: utils/trpc.ts
import { createTRPCContext } from '@trpc/tanstack-react-query';
import type { AppRouter } from '../server/routers/_app';
export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();

// @filename: pages/posts/[id].tsx
// ---cut---
import { dehydrate, useQuery } from '@tanstack/react-query';
import { createTRPCOptionsProxy } from '@trpc/tanstack-react-query';
import type {
  GetServerSidePropsContext,
  InferGetServerSidePropsType,
} from 'next';
import { createContext } from '../../server/context';
import { appRouter } from '../../server/routers/_app';
import { makeQueryClient } from '../../utils/query-client';
import { useTRPC } from '../../utils/trpc';

export async function getServerSideProps(
  context: GetServerSidePropsContext<{ id: string }>,
) {
  const id = context.params?.id as string;
  const queryClient = makeQueryClient();
  const trpc = createTRPCOptionsProxy({
    router: appRouter,
    ctx: await createContext({ headers: context.req.headers }),
    queryClient,
  });

  await queryClient.prefetchQuery(trpc.post.byId.queryOptions({ id }));

  return {
    props: {
      trpcState: dehydrate(queryClient),
      id,
    },
  };
}

export default function PostPage(
  props: InferGetServerSidePropsType<typeof getServerSideProps>,
) {
  const trpc = useTRPC();
  const postQuery = useQuery(trpc.post.byId.queryOptions({ id: props.id }));

  switch (postQuery.status) {
    case 'pending':
      return <p>Loading...</p>;
    case 'error':
      return <p>Error: {postQuery.error.message}</p>;
    case 'success':
      return (
        <article>
          <h1>{postQuery.data.title}</h1>
          <p>{postQuery.data.text}</p>
        </article>
      );
  }
}
```

The page reads the query as it would without prefetching, so `status` is `'success'` on the first render. Use the same input in both places: it's part of the query key.

:::tip
To stop the two inputs from drifting apart, return a **handle** instead of the `id`. `const post = await trpc.post.byId.unstable_$ensure({ id })` waits for the data like `prefetchQuery`, and rejects like `fetchQuery` if the query fails. Return `post` in `props`, and the page reads it with `useQuery(trpc.unstable_$fromHandle(props.post))`. See [Prefetching with handles](/docs/client/tanstack-react-query/handles).
:::

`prefetchQuery` never throws, and the cache only sends queries that succeeded, so a failed query fetches again in the browser. To act on an error on the server, use `fetchQuery`, which returns the data or throws. See [Set the status and cache headers](#set-the-status-and-cache-headers).

### Build the context from the request

The proxy calls your procedures in the same process, so there's no URL to set and no headers to forward. Build the context from `context.req` instead, as the API handler does. Sharing one `createContext` that only needs the headers keeps the two the same:

```ts twoslash title='server/context.ts'
// @filename: server/auth.ts
export declare function getUserFromCookie(cookie: string | undefined): Promise<{ id: string } | null>;

// @filename: server/context.ts
// ---cut---
import type { IncomingHttpHeaders } from 'node:http';
import { getUserFromCookie } from './auth';

export async function createContext(opts: { headers: IncomingHttpHeaders }) {
  // verify the session here: headers come from the client, so don't
  // trust a user ID that's simply sent in one
  const user = await getUserFromCookie(opts.headers.cookie);
  return { user };
}
```

```ts twoslash title='pages/api/trpc/[trpc].ts'
// @filename: server/auth.ts
export declare function getUserFromCookie(cookie: string | undefined): Promise<{ id: string } | null>;

// @filename: server/context.ts
import type { IncomingHttpHeaders } from 'node:http';
import { getUserFromCookie } from './auth';
export async function createContext(opts: { headers: IncomingHttpHeaders }) {
  return { user: await getUserFromCookie(opts.headers.cookie) };
}

// @filename: server/routers/_app.ts
import { initTRPC } from '@trpc/server';
import type { createContext } from '../context';
const t = initTRPC.context<Awaited<ReturnType<typeof createContext>>>().create();
export const appRouter = t.router({});

// @filename: pages/api/trpc/[trpc].ts
// ---cut---
import * as trpcNext from '@trpc/server/adapters/next';
import { createContext } from '../../../server/context';
import { appRouter } from '../../../server/routers/_app';

export default trpcNext.createNextApiHandler({
  router: appRouter,
  createContext: (opts) => createContext({ headers: opts.req.headers }),
});
```

<details>
<summary>If your API runs on another server</summary>

Pass a tRPC client to `createTRPCOptionsProxy` instead of the router. The request now goes over HTTP, so it needs the API's full URL, and you forward the headers the API needs, such as the cookie:

```ts twoslash title='pages/posts/[id].tsx'
// @filename: server/routers/_app.ts
import { initTRPC } from '@trpc/server';
const t = initTRPC.create();
export const appRouter = t.router({});
export type AppRouter = typeof appRouter;

// @filename: utils/query-client.ts
import { QueryClient } from '@tanstack/react-query';
export function makeQueryClient() { return new QueryClient(); }

// @filename: pages/posts/[id].tsx
// ---cut---
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import { createTRPCOptionsProxy } from '@trpc/tanstack-react-query';
import type { GetServerSidePropsContext } from 'next';
import type { AppRouter } from '../../server/routers/_app';
import { makeQueryClient } from '../../utils/query-client';

export async function getServerSideProps(context: GetServerSidePropsContext) {
  const queryClient = makeQueryClient();
  const trpc = createTRPCOptionsProxy({
    client: createTRPCClient<AppRouter>({
      links: [
        httpBatchLink({
          url: 'https://api.example.com/trpc',
          headers: () => ({ cookie: context.req.headers.cookie }),
        }),
      ],
    }),
    queryClient,
  });
  // prefetch and dehydrate as above
}
```

</details>

## Set the status and cache headers

`getServerSideProps` gets the response as `context.res`, so you set headers on it directly. To send a 404 when a post doesn't exist, use `fetchQuery`, catch the `TRPCError`, and return `notFound`:

```tsx twoslash title='pages/posts/[id].tsx'
// @filename: server/routers/_app.ts
import { initTRPC } from '@trpc/server';
import { z } from 'zod';
const t = initTRPC.create();
export const appRouter = t.router({
  post: t.router({
    byId: t.procedure
      .input(z.object({ id: z.string() }))
      .query((opts) => ({ id: opts.input.id, title: 'Example Post' })),
  }),
});

// @filename: utils/query-client.ts
import { QueryClient } from '@tanstack/react-query';
export function makeQueryClient() { return new QueryClient(); }

// @filename: pages/posts/[id].tsx
// ---cut---
import { dehydrate } from '@tanstack/react-query';
import { TRPCError } from '@trpc/server';
import { createTRPCOptionsProxy } from '@trpc/tanstack-react-query';
import type { GetServerSidePropsContext } from 'next';
import { appRouter } from '../../server/routers/_app';
import { makeQueryClient } from '../../utils/query-client';

export async function getServerSideProps(
  context: GetServerSidePropsContext<{ id: string }>,
) {
  const id = context.params?.id as string;
  const queryClient = makeQueryClient();
  const trpc = createTRPCOptionsProxy({
    router: appRouter,
    ctx: {},
    queryClient,
  });

  try {
    await queryClient.fetchQuery(trpc.post.byId.queryOptions({ id }));
  } catch (cause) {
    if (cause instanceof TRPCError && cause.code === 'NOT_FOUND') {
      return { notFound: true };
    }
    throw cause;
  }

  // cache the page for 1 day, and revalidate it once a second at most
  const ONE_DAY_IN_SECONDS = 60 * 60 * 24;
  context.res.setHeader(
    'cache-control',
    `s-maxage=1, stale-while-revalidate=${ONE_DAY_IN_SECONDS}`,
  );

  return {
    props: {
      trpcState: dehydrate(queryClient),
      id,
    },
  };
}
```

Only cache pages that look the same for everyone. If the page depends on the user's cookie, leave out the `cache-control` header. See also the general [Response Caching](../../../server/caching.md) docs.

### API Response Caching with Next.js Adapter

You can also use `responseMeta` on the Next.js API handler to cache API responses directly:

```tsx twoslash title='pages/api/trpc/[trpc].ts'
import { initTRPC } from '@trpc/server';
import * as trpcNext from '@trpc/server/adapters/next';

export const createContext = async ({
  req,
  res,
}: trpcNext.CreateNextContextOptions) => {
  return {
    req,
    res,
  };
};

type Context = Awaited<ReturnType<typeof createContext>>;

export const t = initTRPC.context<Context>().create();

export const appRouter = t.router({
  public: t.router({
    slowQueryCached: t.procedure.query(async (opts) => {
      await new Promise((resolve) => setTimeout(resolve, 5000));

      return {
        lastUpdated: new Date().toJSON(),
      };
    }),
  }),
});

export type AppRouter = typeof appRouter;

export default trpcNext.createNextApiHandler({
  router: appRouter,
  createContext,
  responseMeta(opts) {
    const { ctx, paths, errors, type } = opts;
    // assuming you have all your public routes with the keyword `public` in them
    const allPublic = paths && paths.every((path) => path.includes('public'));
    // checking that no procedures errored
    const allOk = errors.length === 0;
    // checking we're doing a query request
    const isQuery = type === 'query';

    if (ctx?.res && allPublic && allOk && isQuery) {
      // cache request for 1 day + revalidate once every second
      const ONE_DAY_IN_SECONDS = 60 * 60 * 24;
      return {
        headers: new Headers([
          [
            'cache-control',
            `s-maxage=1, stale-while-revalidate=${ONE_DAY_IN_SECONDS}`,
          ],
        ]),
      };
    }
    return {};
  },
});
```

## FAQ

### Q: Why does the client still fetch data the server prefetched?

TanStack React Query refetches stale data when a component mounts, when the window regains focus, and when the network reconnects. The query client from the [setup](./setup.md#4-create-a-query-client-factory) keeps data fresh for 30 seconds with `staleTime`, so the first render uses what the server sent. Raise `staleTime` to fetch less, or see [SSG](./ssg.md#stop-the-client-from-refetching) to turn refetching off.

### Q: Can I use `useSuspenseQuery`?

Yes, for queries the page prefetched. A query that isn't in the cache suspends during the server render too, and the server can't reach your API's relative URL. Prefetch it in `getServerSideProps`, or use `useQuery`, which only fetches in the browser.
