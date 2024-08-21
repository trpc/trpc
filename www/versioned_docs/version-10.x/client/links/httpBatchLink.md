---
id: httpBatchLink
title: HTTP Batch Link
sidebar_label: HTTP Batch Link
slug: /client/links/httpBatchLink
---

`httpBatchLink` is a [**terminating link**](./overview.md#the-terminating-link) that batches an array of individual tRPC operations into a single HTTP request that's sent to a single tRPC procedure.

## Usage

You can import and add the `httpBatchLink` to the `links` array as such:

```ts title="client/index.ts"
import { createTRPCProxyClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from '../server';

const client = createTRPCProxyClient<AppRouter>({
  links: [
    httpBatchLink({
      url: 'http://localhost:3000',
    }),
  ],
});
```

After that, you can make use of batching by setting all your procedures in a `Promise.all`. The code below will produce exactly **one** HTTP request and on the server exactly **one** database query:

```ts
const somePosts = await Promise.all([
  trpc.post.byId.query(1),
  trpc.post.byId.query(2),
  trpc.post.byId.query(3),
]);
```

## `httpBatchLink` Options

The `httpBatchLink` function takes an options object that has the `HTTPBatchLinkOptions` shape.

```ts
export interface HTTPBatchLinkOptions extends HTTPLinkOptions {
  maxURLLength?: number;
}

export interface HTTPLinkOptions {
  url: string;
  /**
   * Add ponyfill for fetch
   */
  fetch?: typeof fetch;
  /**
   * Add ponyfill for AbortController
   */
  AbortController?: typeof AbortController | null;
  /**
   * Headers to be set on outgoing requests or a callback that of said headers
   * @link http://trpc.io/docs/v10/header
   */
  headers?:
    | HTTPHeaders
    | ((opts: { opList: Operation[] }) => HTTPHeaders | Promise<HTTPHeaders>);
}
```

## Setting a maximum URL length

When sending batch requests, sometimes the URL can become too large causing HTTP errors like [`413 Payload Too Large`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/413), [`414 URI Too Long`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/414), and [`404 Not Found`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/404). The `maxURLLength` option will limit the number of requests that can be sent together in a batch.

```ts title="client/index.ts"
import { createTRPCProxyClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from '../server';

const client = createTRPCProxyClient<AppRouter>({
  links: [
    httpBatchLink({
      url: 'http://localhost:3000',
      maxURLLength: 2083, // a suitable size
    }),
  ],
});
```

## Disabling request batching

### 1. Disable `batching` on your server:

```ts title="server.ts"
import { createHTTPServer } from '@trpc/server/adapters/standalone';

createHTTPServer({
  // [...]
  // 👇 disable batching
  batching: {
    enabled: false,
  },
});
```

or, if you're using Next.js:

```ts title='pages/api/trpc/[trpc].ts'
export default trpcNext.createNextApiHandler({
  // [...]
  // 👇 disable batching
  batching: {
    enabled: false,
  },
});
```

### 2. Replace `httpBatchLink` with [`httpLink`](./httpLink.md) in your tRPC Client

```ts title="client/index.ts"
import { createTRPCProxyClient, httpLink } from '@trpc/client';
import type { AppRouter } from '../server';

const client = createTRPCProxyClient<AppRouter>({
  links: [
    httpLink({
      url: 'http://localhost:3000',
    }),
  ],
});
```

or, if you're using Next.js:

```tsx title='utils/trpc.ts'
import type { AppRouter } from '@/server/routers/app';
import { httpLink } from '@trpc/client';
import { createTRPCNext } from '@trpc/next';

export const trpc = createTRPCNext<AppRouter>({
  config() {
    return {
      links: [
        httpLink({
          url: '/api/trpc',
        }),
      ],
    };
  },
});
```

## Reference

You can check out the source code for this link on [GitHub.](https://github.com/trpc/trpc/blob/main/packages/client/src/links/httpBatchLink/index.ts)
