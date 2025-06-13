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
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from '../server';

const client = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: 'http://localhost:3000',
    }),
    // transformer,
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

## `httpBatchLink` Options {#options}

The `httpBatchLink` function takes an options object that has the `HTTPBatchLinkOptions` shape.

```ts
export interface HTTPBatchLinkOptions extends HTTPLinkOptions {
  /**
   * Maximum length of HTTP URL allowed before operations are split into multiple requests
   * @default Infinity
   */
  maxURLLength?: number;
  /**
   * Maximum number of operations allowed in a single batch request
   * @default Infinity
   */
  maxItems?: number;
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
   * Data transformer
   * @see https://trpc.io/docs/data-transformers
   **/
  transformer?: DataTransformerOptions;
  /**
   * Headers to be set on outgoing requests or a callback that of said headers
   * @see http://trpc.io/docs/header
   */
  headers?:
    | HTTPHeaders
    | ((opts: { opList: Operation[] }) => HTTPHeaders | Promise<HTTPHeaders>);
}
```

## Custom Content Handlers (`contentHandlers`)

The `contentHandlers` option lets you define custom serialization and deserialization logic for different content types. This is useful for supporting formats other than JSON, such as MessagePack or custom binary formats.

The `contentHandlers` object uses content-type strings as keys (e.g., `"application/json"`, `"application/x-msgpack"`), and each value is an object with `serialize` and `deserialize` functions:

```ts
contentHandlers: {
  'application/json': {
    serialize: (body) => JSON.stringify(body),
    deserialize: (response) => response.json(),
  },
  'application/x-msgpack': {
    serialize: (body) => encodeMsgPack(body), // your custom encoder
    deserialize: (response) => response.arrayBuffer().then(decodeMsgPack), // your custom decoder
  },
  // ...add more handlers as needed
}
```

**Example: Using a custom content type**

```ts title="client/index.ts"
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from '../server';
import { decodeMsgPack, encodeMsgPack } from './msgpack-utils';

const client = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: 'http://localhost:3000',
      contentHandlers: {
        'application/x-msgpack': {
          serialize: (body) => encodeMsgPack(body),
          deserialize: (response) => response.arrayBuffer().then(decodeMsgPack),
        },
        // fallback to JSON
        'application/json': {
          serialize: (body) => JSON.stringify(body),
          deserialize: (response) => response.json(),
        },
      },
      headers: {
        'content-type': 'application/x-msgpack',
        accept: 'application/x-msgpack',
      },
    }),
  ],
});
```

The link will use the appropriate handler based on the `content-type` and `accept` headers of the request and response.

## Setting a maximum URL length

When sending batch requests, sometimes the URL can become too large causing HTTP errors like [`413 Payload Too Large`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/413), [`414 URI Too Long`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/414), and [`404 Not Found`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/404). The `maxURLLength` option will limit the number of requests that can be sent together in a batch.

> An alternative way of doing this is to

```ts title="client/index.ts"
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from '../server';

const client = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: 'http://localhost:3000',
      maxURLLength: 2083, // a suitable size
      // alternatively, you can make all RPC-calls to be called with POST
      // methodOverride: 'POST',
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
  allowBatching: false,
});
```

or, if you're using Next.js:

```ts title='pages/api/trpc/[trpc].ts'
export default trpcNext.createNextApiHandler({
  // [...]
  // 👇 disable batching
  allowBatching: false,
});
```

### 2. Replace `httpBatchLink` with [`httpLink`](./httpLink.md) in your tRPC Client

```ts title="client/index.ts"
import { createTRPCClient, httpLink } from '@trpc/client';
import type { AppRouter } from '../server';

const client = createTRPCClient<AppRouter>({
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
