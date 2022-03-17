---
id: ssr
title: Server-Side Rendering
sidebar_label: Server-Side Rendering (SSR)
slug: /ssr
---

The only thing you need to do to get SSR on your application is to set `ssr: true` in your `_app.tsx`, but it comes with some additional considerations.

In order to execute queries properly during the server-side render step and customize caching behavior, we might want to add some extra logic inside our `_app.tsx`:

```tsx
import React from 'react';
import { withTRPC } from '@trpc/next';
import { AppType } from 'next/dist/shared/lib/utils';
import type { AppRouter } from './api/trpc/[trpc]';

const MyApp: AppType = ({ Component, pageProps }) => {
  return <Component {...pageProps} />;
};

export default withTRPC<AppRouter>({
  config({ ctx }) {
    if (typeof window !== 'undefined') {
      // during client requests
      return {
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
      url,
      headers: {
        // optional - inform server that it's an ssr request
        'x-ssr': '1',
      },
    };
  },
  ssr: true,
})(MyApp);
```

## Caveats

When you enable SSR, tRPC will use `getInitialProps` to prefetch all queries on the server. That causes problems [like this](https://github.com/trpc/trpc/issues/596) when you use `getServerSideProps` in a page and solving it is out of our hands. Though, you can use [SSG Helpers](/docs/ssg-helpers) to prefetch queries in `getStaticSiteProps` or `getServerSideProps`.
