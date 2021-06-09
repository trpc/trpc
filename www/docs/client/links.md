---
id: links
title: Links
sidebar_label: Links
slug: /links
---

Similar to urql's [_exchanges_](https://formidable.com/open-source/urql/docs/architecture/) or Apollo's [links](https://www.apollographql.com/docs/react/api/link/introduction/).

Links helps you customize the flow of data between TRPC Client and the tRPC-server.


## Example - Procedure call batching

> The below examples assuming you use Next.js, but the same as below can be added if you use the vanilla tRPC client

### 1. Enable `batching` on your server:

In your `[trpc].ts`:

```ts
export default trpcNext.createNextApiHandler({
  // [...]
  batching: {
    enabled: true,
  },
});
```

### 2. Add batching to your tRPC Client


```ts
import { withTRPC } from '@trpc/next';
import { AppType } from 'next/dist/next-server/lib/utils';
import { httpBatchLink } from '@trpc/client/links/httpBatchLink';
const MyApp: AppType = ({ Component, pageProps }) => {
  return <Component {...pageProps} />;
};

export default withTRPC(
  () => {
    return {
      links: [
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

