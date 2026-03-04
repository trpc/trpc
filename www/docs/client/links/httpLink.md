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

```ts twoslash title="client/index.ts"
// @filename: server.ts
import { initTRPC } from '@trpc/server';
const t = initTRPC.create();
export const appRouter = t.router({});
export type AppRouter = typeof appRouter;

// @filename: client.ts
// ---cut---
import { createTRPCClient, httpLink } from '@trpc/client';
import type { AppRouter } from './server';

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

```ts twoslash
type DataTransformerOptions = any;
type HTTPHeaders = Record<string, string[] | string | undefined>;
type Operation = { id: number; type: string; input: unknown; path: string };
// ---cut---
export interface HTTPLinkOptions {
  url: string | URL;
  /**
   * Add ponyfill for fetch
   */
  fetch?: typeof fetch;
  /**
   * Data transformer
   * @see https://trpc.io/docs/server/data-transformers
   **/
  transformer?: DataTransformerOptions;
  /**
   * Headers to be set on outgoing requests or a callback that of said headers
   * @see https://trpc.io/docs/client/headers
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

## Reference

You can check out the source code for this link on [GitHub.](https://github.com/trpc/trpc/blob/main/packages/client/src/links/httpLink.ts)
