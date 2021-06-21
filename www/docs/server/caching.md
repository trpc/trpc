---
id: caching
title: Response Caching
sidebar_label: Response Caching
slug: /caching
---

The below examples uses [Vercel's edge caching](https://vercel.com/docs/serverless-functions/edge-caching) to serve data to your users as fast as possible.


## App Caching

If you turn on SSR in your app you might discover that your app loads slow on for instance Vercel, but you can actually statically render your whole app without using SSG; [read this Twitter thread](https://twitter.com/alexdotjs/status/1386274093041950722) for more insights.

### Example code

```tsx
// in _app.tsx
export default withTRPC({
  config({ ctx }) {
    if (process.browser) {
      return {
        url: '/api/trpc',
      };
    }

    // cache full page for 1 day + revalidate once every second
    const ONE_DAY_IN_SECONDS = 60 * 60 * 24;
    ctx.res?.setHeader(
      'Cache-Control',
      `s-maxage=1, stale-while-revalidate=${ONE_DAY_IN_SECONDS}`,
    );


    const url = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}/api/trpc`
      : 'http://localhost:3000/api/trpc';

    return {
      url,
    };
  },
  ssr: true,
})(MyApp);

```



## API Response caching

Since all queries are normal HTTP `GET`s we can use normal HTTP headers to cache responses, make the responses snappy, give your database a rest, and easier scale your API to gazillions of users.

### Example code

```tsx
import * as trpc from '@trpc/server';
import { inferAsyncReturnType } from '@trpc/server';
import * as trpcNext from '@trpc/server/adapters/next';

// The app's context - is generated for each incoming request
export async function createContext(opts?: trpcNext.CreateNextContextOptions) {
  // Opts is marked as optional so can easier use the `createContext()`-fn in `getStaticProps`, etc
  return {
    req: opts?.req,
    res: opts?.res,
  };
}
type Context = inferAsyncReturnType<typeof createContext>;

export function createRouter() {
  return trpc.router<Context>();
}

const waitFor = async (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

// Important: only use this export with SSR/SSG
export const appRouter = createRouter()
  .query('slow-query-cached', {
    async resolve({ ctx }) {
      // See https://vercel.com/docs/serverless-functions/edge-caching
      ctx.res?.setHeader('Cache-Control', 's-maxage=1, stale-while-revalidate');

      await waitFor(5000); // wait for 5s

      return {
        lastUpdated: new Date().toJSON(),
      };
    },
  })
  .query('slow-query-uncached', {
    async resolve() {
      await waitFor(5000); // wait for 5s

      return {
        lastUpdated: new Date().toJSON(),
      };
    },
  });

// Exporting type _type_ AppRouter only exposes types that can be used for inference
// https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-8.html#type-only-imports-and-export
export type AppRouter = typeof appRouter;

// export API handler
export default trpcNext.createNextApiHandler({
  router: appRouter,
  createContext,
});

```