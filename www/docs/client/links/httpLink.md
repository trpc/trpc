---
id: httpLink
title: HTTP Link
sidebar_label: HTTP Link
slug: /links/httpLink
---

`httpLink` is a [**terminating link**](./index.md#the-terminating-link) that sends a tRPC operation to a tRPC procedure over HTTP.

`httpLink` supports both POST and GET requests.

## Usage

You can import and add the `httpLink` to the `links` array as such:

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

## Using a custom input encoder/decoder pair

This option can be helpful when your server has a hard limits on the URL length, yet you want to sqeeze as much data as possible.
It supports any string-based format like Base64, [Zipson](https://jgranstrom.github.io/zipson/) or [JSURL2](https://github.com/wmertens/jsurl2).

### 1. Configure `inputDecoder` on your server:

```ts title="server.ts"
import { createHTTPServer } from '@trpc/server/adapters/standalone';

createHTTPServer({
  inputDecoder: (input) => {
    const decoded = decompress(input);
    return JSON.parse(decoded);
  },
});
```

### 2. Configure `inputEncoder` with [`httpLink`](./httpLink.md) in your tRPC Client

```ts title="client/index.ts"
import { createTRPCProxyClient, httpLink } from '@trpc/client';
import type { AppRouter } from '../server';

const client = createTRPCProxyClient<AppRouter>({
  links: [
    httpLink({
      url: 'http://localhost:3000',
      inputEncoder: (input) => {
        const encoded = JSON.stringify(input);
        return compress(encoded);
      },
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
   * Headers to be set on outgoing requests or a callback that of said headers
   * @link http://trpc.io/docs/v10/header
   */
  headers?: HTTPHeaders | (() => HTTPHeaders | Promise<HTTPHeaders>);
  /**
   * Custom encoder to be used when serializing the input into a query string entry.
   */
  inputEncoder?: InputEncoder;
}
```

## Reference

You can check out the source code for this link on [GitHub.](https://github.com/trpc/trpc/blob/main/packages/client/src/links/httpLink.ts)
