---
id: ssr
title: Server-Side Rendering
sidebar_label: Server-Side Rendering (SSR)
slug: /ssr
---

The only thing you need to do to get SSR on your application is to set `ssr: true` in your `_app.tsx`, but it comes with some additional considerations.

In order to execute queries properly during the server-side render step and customize caching behavior, we might want to add some extra logic inside our `_app.tsx`:

```tsx title='pages/_app.tsx'
import { withTRPC } from '@trpc/next';
import { AppType } from 'next/dist/shared/lib/utils';
import React from 'react';
import superjson from 'superjson';
import type { AppRouter } from './api/trpc/[trpc]';

const MyApp: AppType = ({ Component, pageProps }) => {
  return <Component {...pageProps} />;
};

export default withTRPC<AppRouter>({
  config({ ctx }) {
    if (typeof window !== 'undefined') {
      // during client requests
      return {
        transformer: superjson, // optional - adds superjson serialization
        url: '/api/trpc',
      };
    }
    // during SSR below

    // optional: use SSG-caching for each rendered page (see caching section for more details)
    const ONE_DAY_SECONDS = 60 * 60 * 24;
    ctx?.res?.setHeader(
      'Cache-Control',
      `s-maxage=1, stale-while-revalidate=${ONE_DAY_SECONDS}`,
    );

    // The server needs to know your app's full url
    // On render.com you can use `http://${process.env.RENDER_INTERNAL_HOSTNAME}:${process.env.PORT}/api/trpc`
    const url = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}/api/trpc`
      : 'http://localhost:3000/api/trpc';

    return {
      transformer: superjson, // optional - adds superjson serialization
      url,
      /**
       * Set custom request headers on every request from tRPC
       * @see http://localhost:3000/docs/v9/header
       * @see http://localhost:3000/docs/v9/ssr
       */
      headers() {
        if (ctx?.req) {
          // To use SSR properly, you need to forward the client's headers to the server
          // This is so you can pass through things like cookies when we're server-side rendering

          // If you're using Node 18, omit the "connection" header
          const {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            connection: _connection,
            ...headers
          } = ctx.req.headers;
          return {
            ...headers,
            // Optional: inform server that it's an SSR request
            'x-ssr': '1',
          };
        }
        return {};
      },
    };
  },
  ssr: true,
})(MyApp);
```

## FAQ

### Q: Why do I need to forward the client's headers to the server manually? Why doesn't tRPC automatically do that for me?

While it's rare that you wouldn't want to forward the client's headers to the server when doing SSR, you might want to add things dynamically in the headers. Therefore, tRPC doesn't want to take responsibility for header keys colliding, etc.

### Q: Why do I need to delete the `connection` header when using SSR on Node 18?

If you don't remove the `connection` header, the data fetching will fail with `TRPCClientError: fetch failed` because `connection` is a [forbidden header name](https://developer.mozilla.org/en-US/docs/Glossary/Forbidden_header_name).

### Q: Can I use `getServerSideProps` and/or `getStaticProps` while using SSR?

When you enable SSR, tRPC will use `getInitialProps` to prefetch all queries on the server. That causes problems [like this](https://github.com/trpc/trpc/issues/596) when you use `getServerSideProps` in a page and solving it is out of our hands. Though, you can use [SSG Helpers](ssg-helpers) to prefetch queries in `getStaticProps` or `getServerSideProps`.
