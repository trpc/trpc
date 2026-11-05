---
id: caching
title: Response Caching
sidebar_label: Response Caching
slug: /server/caching
section: "Backend Usage"
order: 26
skill:
  name: caching
  package: "@trpc/server"
  type: core
  requires:
    - server-setup
  description: Set HTTP cache headers on tRPC query responses via the adapter's
    responseMeta callback (info, ctx, type, errors, eagerGeneration) for CDN and
    browser caching. Configure Cache-Control, s-maxage, stale-while-revalidate.
    Handle caching with batching, streaming and authenticated requests. Avoid
    caching mutations, errors, and authenticated responses. In the Next.js App
    Router, set them in fetchRequestHandler's responseMeta and send public
    queries through httpLink with splitLink.
---

Since all tRPC queries are normal HTTP `GET` requests, you can use standard HTTP cache headers to cache responses. This can make responses snappy, give your database a rest, and help scale your API.

:::info
Always be careful with caching - especially if you handle personal information.

&nbsp;
Since batching is enabled by default, it's recommended to set your cache headers in the `responseMeta` function and make sure that there are not any concurrent calls that may include personal data - or to omit cache headers completely if there is an auth header or cookie.

&nbsp;
You can also use a [`splitLink`](../client/links/splitLink.md) to split your public requests and those that should be private and uncached.
:::

## Using `responseMeta` to cache responses

Most tRPC adapters support a `responseMeta` callback that lets you set HTTP headers (including cache headers) based on the procedures being called.

> This works with any hosting provider that supports standard HTTP cache headers (e.g. Vercel, Cloudflare, AWS CloudFront).

```ts twoslash title='server.ts'
import { initTRPC } from '@trpc/server';
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import type { CreateHTTPContextOptions } from '@trpc/server/adapters/standalone';

export const createContext = async (opts: CreateHTTPContextOptions) => {
  return {
    req: opts.req,
    res: opts.res,
  };
};

type Context = Awaited<ReturnType<typeof createContext>>;

export const t = initTRPC.context<Context>().create();

const waitFor = async (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

export const appRouter = t.router({
  public: t.router({
    slowQueryCached: t.procedure.query(async (opts) => {
      await waitFor(5000); // wait for 5s

      return {
        lastUpdated: new Date().toJSON(),
      };
    }),
  }),
});

// Exporting `type AppRouter` only exposes types that can be used for inference
// https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-8.html#type-only-imports-and-export
export type AppRouter = typeof appRouter;

// export API handler
const server = createHTTPServer({
  router: appRouter,
  createContext,
  responseMeta(opts) {
    const { info, errors, type, eagerGeneration } = opts;
    // assuming all your public routes are in the `public` router
    const allPublic = info?.calls.every((call) =>
      call.path.startsWith('public.'),
    );
    // checking that no procedures errored
    // (when streaming, headers are sent before any results are known)
    const allOk = !eagerGeneration && errors.length === 0;
    // checking we're doing a query request
    const isQuery = type === 'query';

    if (allPublic && allOk && isQuery) {
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

server.listen(3000);
```

`responseMeta` runs once per HTTP response, so with batching it decides the headers for every procedure in the batch: only cache if all of them are public. It also gets the request's `ctx`, e.g. to skip caching for signed-in users. For streamed responses, like those of [`httpBatchStreamLink`](../client/links/httpBatchStreamLink.md), the headers are sent before any procedure has finished, so `responseMeta` runs with `eagerGeneration: true` and an empty `errors` array.

:::tip
If you are using the Next.js Pages Router, see [Server-Side Rendering](/docs/client/nextjs/pages-router/ssr#set-the-status-and-cache-headers) for caching pages in `getServerSideProps`, and for caching responses with the Next.js adapter.
:::

## Next.js App Router

With the App Router, tRPC runs in a [route handler](/docs/client/nextjs/app-router-setup) with the fetch adapter. Next.js sends the route handler's `Response` as it is, so set `Cache-Control` in the `responseMeta` of `fetchRequestHandler`. Route segment config like `export const dynamic = 'force-dynamic'` or `export const revalidate = 60` doesn't change the header.

```ts twoslash title='app/api/trpc/[trpc]/route.ts'
// @filename: trpc/init.ts
import { initTRPC } from '@trpc/server';
export const createTRPCContext = async (opts: { headers: Headers }) => {
  return { userId: 'user_123' };
};
const t = initTRPC
  .context<Awaited<ReturnType<typeof createTRPCContext>>>()
  .create();
export const createTRPCRouter = t.router;
export const baseProcedure = t.procedure;

// @filename: trpc/routers/_app.ts
import { baseProcedure, createTRPCRouter } from '../init';
export const appRouter = createTRPCRouter({
  public: createTRPCRouter({
    posts: baseProcedure.query(() => [{ title: 'Hello' }]),
  }),
  me: baseProcedure.query((opts) => opts.ctx.userId),
});
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
    responseMeta(opts) {
      const { info, errors, type, eagerGeneration } = opts;
      // assuming all your public routes are in the `public` router
      const allPublic = info?.calls.every((call) =>
        call.path.startsWith('public.'),
      );
      const allOk = !eagerGeneration && errors.length === 0;
      const isQuery = type === 'query';

      if (allPublic && allOk && isQuery) {
        return {
          headers: new Headers([
            ['cache-control', 's-maxage=60, stale-while-revalidate=86400'],
          ]),
        };
      }
      return {};
    },
  });

export { handler as GET, handler as POST };
```

:::caution
Don't set `Cache-Control` for your tRPC endpoint with [`headers` in `next.config.js`](https://nextjs.org/docs/app/api-reference/config/next-config-js/headers). In a production build it replaces the header from `responseMeta`, and it's added to every response on the matching path, including batches with private procedures, errors and mutations.
:::

### Batching

`responseMeta` runs once per batch, not once per procedure. With `httpBatchLink`, a public query made at the same time as a private one shares its request, so the response isn't cached. And a CDN caches each batch by its URL, which holds every procedure and input in the batch, so the same public query rarely hits the cache.

Send cacheable public queries through `httpLink` with a [`splitLink`](../client/links/splitLink.md), so each one is a `GET` request of its own, and keep batching the rest. `getUrl()` is the one from the [App Router setup](/docs/client/nextjs/app-router-setup):

```ts twoslash title='trpc/client.tsx'
// @filename: trpc/routers/_app.ts
import { initTRPC } from '@trpc/server';
const t = initTRPC.create();
export const appRouter = t.router({
  public: t.router({
    posts: t.procedure.query(() => [{ title: 'Hello' }]),
  }),
});
export type AppRouter = typeof appRouter;

// @filename: trpc/client.tsx
declare function getUrl(): string;
// ---cut---
import {
  createTRPCClient,
  httpBatchLink,
  httpLink,
  splitLink,
} from '@trpc/client';
import type { AppRouter } from './routers/_app';

const trpcClient = createTRPCClient<AppRouter>({
  links: [
    splitLink({
      condition: (op) => op.type === 'query' && op.path.startsWith('public.'),
      true: httpLink({ url: getUrl() }),
      false: httpBatchLink({ url: getUrl() }),
    }),
  ],
});
```
