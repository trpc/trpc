---
id: httpLink
title: HTTP Link
sidebar_label: HTTP Link
slug: /client/links/httpLink
---

`httpLink` is a [**terminating link**](./overview.md#the-terminating-link) that sends a tRPC operation to a tRPC procedure over HTTP.

`httpLink` supports both POST and GET requests.

## Usage

You can import and add the `httpLink` to the `links` array as such:

```ts title="client/index.ts"
import { createTRPCClient, httpLink } from '@trpc/client';
import type { AppRouter } from '../server';

const client = createTRPCClient<AppRouter>({
  links: [
    httpLink({
      url: 'http://localhost:3000',
      // transformer,
    }),
  ],
});
```

## `httpLink` Options

The `httpLink` function takes an options object that has the `HTTPLinkOptions` shape.

```ts
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
   * @see https://trpc.io/docs/v11/data-transformers
   **/
  transformer?: DataTransformerOptions;
  /**
   * Headers to be set on outgoing requests or a callback that of said headers
   * @see http://trpc.io/docs/v10/header
   */
  headers?:
    | HTTPHeaders
    | ((opts: { op: Operation }) => HTTPHeaders | Promise<HTTPHeaders>);
  /**
   * Send all requests as POSTS requests regardless of the procedure type
   * The server must separately allow overriding the method. See:
   * @see https://trpc.io/docs/rpc
   */
  methodOverride?: 'POST';
}
```

## Custom Content Handlers (`contentHandlers`)

The `contentHandlers` option allows you to define custom serialization and deserialization logic for different content types. This is useful if you want to support formats other than JSON, such as MessagePack or custom binary formats.

The `contentHandlers` object should have content-type strings as keys (e.g., `"application/json"`, `"application/x-msgpack"`), and each value should be an object with `serialize` and `deserialize` functions:

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
import { createTRPCClient, httpLink } from '@trpc/client';
import type { AppRouter } from '../server';
import { decodeMsgPack, encodeMsgPack } from './msgpack-utils';

const client = createTRPCClient<AppRouter>({
  links: [
    httpLink({
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
      // Optionally set headers to use your custom content type
      headers: {
        'content-type': 'application/x-msgpack',
        accept: 'application/x-msgpack',
      },
    }),
  ],
});
```

The link will use the appropriate handler based on the `content-type` and `accept` headers of the request and response.

## Reference

You can check out the source code for this link on [GitHub.](https://github.com/trpc/trpc/blob/main/packages/client/src/links/httpLink.ts)
