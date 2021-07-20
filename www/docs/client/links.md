---
id: links
title: Links & Request Batching
sidebar_label: Links & Request Batching
slug: /links
---

Similar to urql's [_exchanges_](https://formidable.com/open-source/urql/docs/architecture/) or Apollo's [links](https://www.apollographql.com/docs/react/api/link/introduction/). Links enables you to customize the flow of data between tRPC Client and the tRPC-server.


## Request Batching

Request batching is automatically enabled which batches your requests to the server, this can make the below code produce exactly **one** HTTP request and on the server exactly **one** database query:

```tsx
// below will be done in the same request when batching is enabled
const somePosts = await Promise.all([
  client.query('posts.byId', 1),
  client.query('posts.byId', 2),
  client.query('posts.byId', 3),
])
```

## Customizing data flow

> The below examples assuming you use Next.js, but the same as below can be added if you use the vanilla tRPC client

### Disabling request batching

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


### Using a `splitLink` to control request flow

#### Disable batching for certain requests

##### 1. Configure client / `_app.tsx`

```tsx
import { withTRPC } from '@trpc/next';
import { httpBatchLink } from '@trpc/client/links/httpBatchLink';
import { httpLink } from '@trpc/client/links/httpLink';
import { splitLink } from '@trpc/client/links/splitLink';

// [..]
export default withTRPC<AppRouter>({
  config() {
    const url = `http://localhost:3000`;

    return {
      links: [
        splitLink({
          condition(op) {
            // check for context property `skipBatch`
            return op.context.skipBatch === true;
          },
          left: httpLink({
            url,
          }),
          right: httpBatchLink({
            url,
          }),
        }),
      ],
    };
  },
})(MyApp);
```

##### 2. Perform request without batching

```tsx
const postsQuery = trpc.useQuery(['posts], {
  context: {
    skipBatch: true,
  },
});

// or

const postResult = client.query('posts', null, {
  context: {
    skipBatch: true,
  },
})

```

### Creating a custom link

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

export default withTRPC<AppRouter>({
  config() {
    return {
      links: [
        customLink,
        // [..]
        // ❗ Make sure to end with a `httpBatchLink` or `httpLink`
      ],
    };
  },
  // ssr: false
})(MyApp);


```
