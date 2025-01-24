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
   * @see http://trpc.io/docs/v10/header
   */
  headers?:
    | HTTPHeaders
    | ((opts: { op: Operation }) => HTTPHeaders | Promise<HTTPHeaders>);
}
```

## Reference

You can check out the source code for this link on [GitHub.](https://github.com/trpc/trpc/blob/main/packages/client/src/links/httpLink.ts)
