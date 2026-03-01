---
id: ssr
title: Server-Side Rendering
sidebar_label: Server-Side Rendering (SSR)
slug: /client/nextjs/ssr
---

To enable SSR just set `ssr: true` in your `createTRPCNext` config callback.

:::info
When you enable SSR, tRPC will use `getInitialProps` to prefetch all queries on the server. This results in problems [like this](https://github.com/trpc/trpc/issues/596) when you use `getServerSideProps`, and solving it is out of our hands.

&nbsp;  
Alternatively, you can leave SSR disabled (the default) and use [Server-Side Helpers](server-side-helpers) to prefetch queries in `getStaticProps` or `getServerSideProps`.
:::

In order to execute queries properly during the server-side render step we need to add extra logic inside our `config`:

Additionally, consider [`Response Caching`](../../../server/caching.md).

```tsx title='utils/trpc.ts'
import { httpBatchLink } from '@trpc/client';
import { createTRPCNext } from '@trpc/next';
import { ssrPrepass } from '@trpc/next/ssrPrepass';
import superjson from 'superjson';
import type { AppRouter } from './api/trpc/[trpc]';

export const trpc = createTRPCNext<AppRouter>({
  ssr: true,
  ssrPrepass,
  config(info) {
    const { ctx } = info;
    if (typeof window !== 'undefined') {
      // during client requests
      return {
        links: [
          httpBatchLink({
            url: '/api/trpc',
          }),
        ],
      };
    }

    return {
      links: [
        httpBatchLink({
          // The server needs to know your app's full url
          url: `${getBaseUrl()}/api/trpc`,
          /**
           * Set custom request headers on every request from tRPC
           * @see https://trpc.io/docs/v10/header
           */
          headers() {
            if (!ctx?.req?.headers) {
              return {};
            }
            // To use SSR properly, you need to forward client headers to the server
            // This is so you can pass through things like cookies when we're server-side rendering
            return {
              cookie: ctx.req.headers.cookie,
            };
          },
        }),
      ],
    };
  },
});
```

or, if you want to SSR conditional on a given request, you can pass a callback to `ssr`. This callback can return a boolean, or a Promise resolving to a boolean:

```tsx title='utils/trpc.ts'
import { httpBatchLink } from '@trpc/client';
import { createTRPCNext } from '@trpc/next';
import superjson from 'superjson';
import type { AppRouter } from './api/trpc/[trpc]';

export const trpc = createTRPCNext<AppRouter>({
  config(info) {
    const { ctx } = info;
    if (typeof window !== 'undefined') {
      // during client requests
      return {
        links: [
          httpBatchLink({
            url: '/api/trpc',
          }),
        ],
      };
    }

    return {
      links: [
        httpBatchLink({
          // The server needs to know your app's full url
          url: `${getBaseUrl()}/api/trpc`,
          /**
           * Set custom request headers on every request from tRPC
           * @see https://trpc.io/docs/v10/header
           */
          headers() {
            if (!ctx?.req?.headers) {
              return {};
            }
            // To use SSR properly, you need to forward client headers to the server
            // This is so you can pass through things like cookies when we're server-side rendering
            return {
              cookie: ctx.req.headers.cookie,
            };
          },
        }),
      ],
    };
  },
  ssr(opts) {
    // only SSR if the request is coming from a bot
    return opts.ctx?.req?.headers['user-agent']?.includes('bot');
  },
});
```

```tsx title='pages/_app.tsx'
import { trpc } from '~/utils/trpc';
import type { AppProps } from 'next/app';
import React from 'react';

const MyApp: AppType = ({ Component, pageProps }: AppProps) => {
  return <Component {...pageProps} />;
};

export default trpc.withTRPC(MyApp);
```

## Response Caching with SSR

If you turn on SSR in your app, you might discover that your app loads slowly on, for instance, Vercel, but you can actually statically render your whole app without using SSG; [read this Twitter thread](https://twitter.com/alexdotjs/status/1386274093041950722) for more insights.

You can use the `responseMeta` callback on `createTRPCNext` to set cache headers for SSR responses. See also the general [Response Caching](../../../server/caching.md) docs for framework-agnostic caching with `responseMeta`.

```tsx title='utils/trpc.tsx'
import { httpBatchLink } from '@trpc/client';
import { createTRPCNext } from '@trpc/next';
import type { AppRouter } from '../server/routers/_app';

export const trpc = createTRPCNext<AppRouter>({
  config() {
    if (typeof window !== 'undefined') {
      return {
        links: [
          httpBatchLink({
            url: '/api/trpc',
          }),
        ],
      };
    }

    const url = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}/api/trpc`
      : 'http://localhost:3000/api/trpc';

    return {
      links: [
        httpBatchLink({
          url,
        }),
      ],
    };
  },
  ssr: true,
  responseMeta(opts) {
    const { clientErrors } = opts;

    if (clientErrors.length) {
      // propagate http first error from API calls
      return {
        status: clientErrors[0].data?.httpStatus ?? 500,
      };
    }

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
  },
});
```

### API Response Caching with Next.js Adapter

You can also use `responseMeta` on the Next.js API handler to cache API responses directly:

```tsx title='pages/api/trpc/[trpc].ts'
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

### Q: Why do I need to forward the client's headers to the server manually? Why doesn't tRPC automatically do that for me?

While it's rare that you wouldn't want to forward the client's headers to the server when doing SSR, you might want to add things dynamically in the headers. Therefore, tRPC doesn't want to take responsibility for header keys colliding, etc.

### Q: Why do I need to delete the `connection` header when using SSR on Node 18?

If you don't remove the `connection` header, the data fetching will fail with `TRPCClientError: fetch failed` because `connection` is a [forbidden header name](https://developer.mozilla.org/en-US/docs/Glossary/Forbidden_header_name).

### Q: Why do I still see network requests being made in the Network tab?

By default, `@tanstack/react-query` (which we use for the data fetching hooks) refetches data on mount and window refocus, even if it's already got initial data via SSR. This ensures data is always up-to-date. See the page on [SSG](ssg) if you'd like to disable this behavior.
