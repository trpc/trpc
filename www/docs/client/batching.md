---
id: batching
title: Request Batching
sidebar_label: Request Batching
slug: /batching
---

Request batching is automatically enabled which batches your requests to the server, this can make the below code produce exactly **one** HTTP request and on the server exactly **one** database query:

```tsx
// below will be done in the same request when batching is enabled
const somePosts = await Promise.all([
  client.query('posts.byId', 1),
  client.query('posts.byId', 2),
  client.query('posts.byId', 3),
])
```

### Disabling request batching

> The below examples assuming you use Next.js, but the same as below can be added if you use the vanilla tRPC client

#### 1. Disable `batching` on your server:

In your `[trpc].ts`:

```ts
export default trpcNext.createNextApiHandler({
  // [...]
  // 👇 disable batching
  batching: {
    enabled: false,
  },
});
```

#### 2. Use batch-free link in your tRPC Client


```ts
import type { AppRouter } from 'pages/api/trpc/[trpc]';
import { withTRPC } from '@trpc/next';
import { AppType } from 'next/dist/next-server/lib/utils';
// 👇 import the httpBatchLink
import { httpLink } from '@trpc/client/links/httpLink';

const MyApp: AppType = ({ Component, pageProps }) => {
  return <Component {...pageProps} />;
};

export default withTRPC<AppRouter>({
  config() {
    return {
      links: [
        httpLink({
          url: '/api/trpc',
        }),
      ],
    };
  },
  // ssr: false,
})(MyApp);
```
