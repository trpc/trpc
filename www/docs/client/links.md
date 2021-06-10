---
id: links
title: Links & Request Batching
sidebar_label: Links & Request Batching
slug: /links
---

Similar to urql's [_exchanges_](https://formidable.com/open-source/urql/docs/architecture/) or Apollo's [links](https://www.apollographql.com/docs/react/api/link/introduction/). Links enables you to customize the flow of data between tRPC Client and the tRPC-server.


## Request batching

You can enable query batching in order to parallelise your requests to the server, this can make the below code produce exactly **one** HTTP request and on the server exactly **one** database query:

```tsx
// below will be done in the same request when batching is enabled
const somePosts = await Promise.all([
  client.query('posts.byId', 1),
  client.query('posts.byId', 2),
  client.query('posts.byId', 3),
])
```

### Enabling request batching on a Next.js project

> The below examples assuming you use Next.js, but the same as below can be added if you use the vanilla tRPC client

#### 1. Enable `batching` on your server:

In your `[trpc].ts`:

```ts
export default trpcNext.createNextApiHandler({
  // [...]
  // 👇 enable batching
  batching: {
    enabled: true,
  },
});
```

#### 2. Add batching to your tRPC Client


```ts
import type { AppRouter } from 'pages/api/trpc/[trpc]';
import { withTRPC } from '@trpc/next';
import { AppType } from 'next/dist/next-server/lib/utils';
// 👇 import the httpBatchLink
import { httpBatchLink } from '@trpc/client/links/httpBatchLink';

const MyApp: AppType = ({ Component, pageProps }) => {
  return <Component {...pageProps} />;
};

export default withTRPC<AppRouter>(
  () => {
    return {
      links: [
        // [..]
        // 👇 add the batch link
        httpBatchLink({
          url: '/api/trpc',
        }),
      ],
    };
  },
  {
    // [..]
  },
)(MyApp);
```

### Custom link

```tsx
import type { AppRouter } from 'pages/api/trpc/[trpc]';
import { TRPCLink } from '@trpc/client';

const customLink: TRPCLink<AppRouter> = (runtime) => {
  // here we just got initialized in the app - this happens once per app
  // useful for storing cache for instance
  return ({ prev, next, op }) => {
    // this is when passing the result to the next link
    next(op, (result) => {
      // this is when we've gotten result from the server
      if (result instanceof Error) {
        // maybe send to bugsnag?
      }
      prev(result);
    });
  };
};

export default withTRPC<AppRouter>(
  () => {
    return {
      links: [
        customLink,
        // [..]
        // ❗ Make sure to end with a `httpBatchLink` or `httpLink`
      ],
    };
  },
  {
    // [..]
  },
)(MyApp);


```
