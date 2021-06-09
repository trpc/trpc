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
// below will be done the same request when batching is enabled
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
  batching: {
    // enable batching
    enabled: true,
  },
});
```

#### 2. Add batching to your tRPC Client


```ts
import { withTRPC } from '@trpc/next';
import { AppType } from 'next/dist/next-server/lib/utils';

// import the http batch link
import { httpBatchLink } from '@trpc/client/links/httpBatchLink';
const MyApp: AppType = ({ Component, pageProps }) => {
  return <Component {...pageProps} />;
};

export default withTRPC(
  () => {
    return {
      links: [
        // add the batch link
        httpBatchLink({
          url: '/api/trpc',
        }),
      ],
    };
  },
  {
    ssr: false,
  },
)(MyApp);
```

