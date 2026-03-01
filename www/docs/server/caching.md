---
id: caching
title: Response Caching
sidebar_label: Response Caching
slug: /server/caching
---

Since all tRPC queries are normal HTTP `GET` requests, you can use standard HTTP cache headers to cache responses. This can make responses snappy, give your database a rest, and help scale your API.

:::info
Always be careful with caching - especially if you handle personal information.

&nbsp;
Since batching is enabled by default, it's recommended to set your cache headers in the `responseMeta` function and make sure that there are not any concurrent calls that may include personal data - or to omit cache headers completely if there is an auth header or cookie.

&nbsp;
You can also use a [`splitLink`](../client/links/splitLink.mdx) to split your public requests and those that should be private and uncached.
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

// Exporting type _type_ AppRouter only exposes types that can be used for inference
// https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-8.html#type-only-imports-and-export
export type AppRouter = typeof appRouter;

// export API handler
const server = createHTTPServer({
  router: appRouter,
  createContext,
  responseMeta(opts) {
    const { paths, errors, type } = opts;
    // assuming you have all your public routes with the keyword `public` in them
    const allPublic = paths && paths.every((path) => path.includes('public'));
    // checking that no procedures errored
    const allOk = errors.length === 0;
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

:::tip
If you are using Next.js, see the [Next.js SSR caching guide](/docs/client/nextjs/pages-router/ssr#response-caching-with-ssr) for Next.js-specific caching examples using `createTRPCNext` and the Next.js adapter.
:::
