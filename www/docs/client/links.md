---
id: links
title: Links & Request Batching
sidebar_label: Links & Request Batching
slug: /links
---

Similar to urql's [_exchanges_](https://formidable.com/open-source/urql/docs/architecture/) or Apollo's [links](https://www.apollographql.com/docs/react/api/link/introduction/). Links enables you to customize the flow of data between tRPC Client and the tRPC-server.


## Request Batching

Request batching is automatically enabled which batches your requests to the server, this can make the below code produce exactly **one** HTTP request and on the server exactly **one** database query:

```ts
// below will be done in the same request when batching is enabled
const somePosts = await Promise.all([
  client.query('post.byId', 1),
  client.query('post.byId', 2),
  client.query('post.byId', 3),
])
```

## Customizing data flow

> The below examples assuming you use Next.js, but the same as below can be added if you use the vanilla tRPC client

### Setting a maximum URL length

When sending batch requests, sometimes the URL can become too large causing HTTP errors like [`413 Payload Too Large`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/413), [`414 URI Too Long`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/414), and [`404 Not Found`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/404). The `maxURLLength` option will limit the number of requests that can be sent together in a batch.

```ts title='server.ts'
import type { AppRouter } from 'pages/api/trpc/[trpc]';
import { withTRPC } from '@trpc/next';
import { AppType } from 'next/dist/shared/lib/utils';
// 👇 import the httpBatchLink
import { httpBatchLink } from '@trpc/client';

const MyApp: AppType = ({ Component, pageProps }) => {
  return <Component {...pageProps} />;
};

export default withTRPC<AppRouter>({
  config() {
    return {
      links: [
        httpBatchLink({
          url: 'http://localhost:3000/api/trpc',
          maxURLLength: 2083 // a suitable size
        }),
      ],
    };
  },
})(MyApp);
```

### Disabling request batching

#### 1. Disable `batching` on your server:

In your `[trpc].ts`:

```ts title='pages/api/trpc/[trpc].ts'
export default trpcNext.createNextApiHandler({
  // [...]
  // 👇 disable batching
  batching: {
    enabled: false,
  },
});
```

#### 2. Use batch-free link in your tRPC Client


```tsx title='pages/_app.tsx'
import type { AppRouter } from 'pages/api/trpc/[trpc]';
import { withTRPC } from '@trpc/next';
import { AppType } from 'next/dist/shared/lib/utils';
// 👇 import the httpLink
import { httpLink } from '@trpc/client';

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

```tsx title='pages/_app.tsx'
import { withTRPC } from '@trpc/next';
import { httpBatchLink } from '@trpc/client';
import { httpLink } from '@trpc/client';
import { splitLink } from '@trpc/client';

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
          // when condition is true, use normal request
          true: httpLink({
            url,
          }),
          // when condition is false, use batching
          false: httpBatchLink({
            url,
          }),
        }),
      ],
    };
  },
})(MyApp);
```

##### 2. Perform request without batching

```tsx title='MyComponent.tsx'
export function MyComponent() {
  const postsQuery = trpc.useQuery(['posts'], {
    context: {
      skipBatch: true,
    },
  });
  return (
    <pre>{JSON.stringify(postsQuery.data ?? null, null, 4)}</pre>
  )
})
```

or:

```ts title='client.ts'
const postResult = client.query('posts', null, {
  context: {
    skipBatch: true,
  },
})
```


### Creating a custom link

> Reference examples can be found in [`packages/client/src/links`](https://github.com/trpc/trpc/tree/main/packages/client/src/links).

```tsx title='utils/customLink.ts'
import { TRPCLink } from '@trpc/client';
import { AppRouter } from 'server/routers/_app';
import { observable } from '@trpc/server/observable';

export const customLink: TRPCLink<AppRouter> = () => {
  // here we just got initialized in the app - this happens once per app
  // useful for storing cache for instance
  return ({ next, op }) => {
    // this is when passing the result to the next link

    // each link needs to return an observable which propagates results
    return observable((observer) => {
      console.log('performing operation:', op);
      const unsubscribe = next(op).subscribe({
        next(value) {
          console.log('we received value', value);
          observer.next(value);
        },
        error(err) {
          console.log('we received error', err);
          observer.error(err);
        },
        complete() {
          observer.complete();
        },
      });

      return unsubscribe;
    });
  };
};


```
