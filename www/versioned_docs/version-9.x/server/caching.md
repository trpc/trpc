---
id: caching
title: Response Caching
sidebar_label: Response Caching
slug: /caching
---

The below examples uses [Vercel's edge caching](https://vercel.com/docs/serverless-functions/edge-caching) to serve data to your users as fast as possible.

## :warning: A word of caution :warning:

Always be careful with caching - especially if you handle personal information.

Since batching is enabled by default, it's recommended to set your cache headers in the `responseMeta` function and make sure that there are not any concurrent calls that may include personal data - or to omit cache headers completely if there is an auth headers or cookie.

You can also use a [`splitLink`](../client/links.md) to split your requests that are public and those that should be private and uncached.

## App Caching

If you turn on SSR in your app you might discover that your app loads slow on for instance Vercel, but you can actually statically render your whole app without using SSG; [read this Twitter thread](https://twitter.com/alexdotjs/status/1386274093041950722) for more insights.

### Example code

```tsx title='pages/_app.tsx'
export default withTRPC({
  config({ ctx }) {
    if (typeof window !== 'undefined') {
      return {
        url: '/api/trpc',
      };
    }

    const url = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}/api/trpc`
      : 'http://localhost:3000/api/trpc';

    return {
      url,
    };
  },
  ssr: true,
  responseMeta({ ctx, clientErrors }) {
    if (clientErrors.length) {
      // propagate http first error from API calls
      return {
        status: clientErrors[0].data?.httpStatus ?? 500,
      };
    }

    // cache request for 1 day + revalidate once every second
    const ONE_DAY_IN_SECONDS = 60 * 60 * 24;
    return {
      headers: {
        'cache-control': `s-maxage=1, stale-while-revalidate=${ONE_DAY_IN_SECONDS}`,
      },
    };
  },
})(MyApp);
```

## API Response caching

Since all queries are normal HTTP `GET`s we can use normal HTTP headers to cache responses, make the responses snappy, give your database a rest, and easier scale your API to gazillions of users.

### Using `responseMeta` to cache responses

> Assuming you're deploying your API somewhere that can handle stale-while-revalidate cache headers like Vercel.

```tsx title='server.ts'
import * as trpc from '@trpc/server';
import { inferAsyncReturnType } from '@trpc/server';
import * as trpcNext from '@trpc/server/adapters/next';

export const createContext = async ({
  req,
  res,
}: trpcNext.CreateNextContextOptions) => {
  return {
    req,
    res,
    prisma,
  };
};

type Context = inferAsyncReturnType<typeof createContext>;

export function createRouter() {
  return trpc.router<Context>();
}

const waitFor = async (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

export const appRouter = createRouter().query('public.slow-query-cached', {
  async resolve({ ctx }) {
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
  responseMeta({ ctx, paths, type, errors }) {
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
        headers: {
          'cache-control': `s-maxage=1, stale-while-revalidate=${ONE_DAY_IN_SECONDS}`,
        },
      };
    }
    return {};
  },
});
```
