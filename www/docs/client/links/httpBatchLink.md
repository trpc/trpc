---
id: httpBatchLink
title: HTTP Batch Link
sidebar_label: HTTP Batch Link
slug: /client/links/httpBatchLink
---

`httpBatchLink` is a [**terminating link**](./overview.md#the-terminating-link) that batches an array of individual tRPC operations into a single HTTP request that's sent to a single tRPC procedure.

## Usage

You can import and add the `httpBatchLink` to the `links` array as such:

```ts twoslash title="client/index.ts"
// @filename: server.ts

// @filename: client.ts
// ---cut---
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import { initTRPC } from '@trpc/server';
import type { AppRouter } from './server';

const t = initTRPC.create();
export const appRouter = t.router({});
export type AppRouter = typeof appRouter;

const client = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: 'http://localhost:3000',
      // transformer,
    }),
  ],
});
```

After that, you can make use of batching by setting all your procedures in a `Promise.all`. The code below will produce exactly **one** HTTP request and on the server exactly **one** database query:

```ts twoslash
// @target: esnext
// @filename: server.ts

// @filename: client.ts
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import { initTRPC } from '@trpc/server';
import { z } from 'zod';
import type { AppRouter } from './server';

const t = initTRPC.create();
export const appRouter = t.router({
  post: t.router({
    byId: t.procedure
      .input(z.number())
      .query(({ input }) => ({ id: input, title: `Post ${input}` })),
  }),
});
export type AppRouter = typeof appRouter;

const trpc = createTRPCClient<AppRouter>({
  links: [httpBatchLink({ url: 'http://localhost:3000' })],
});
// ---cut---
const somePosts = await Promise.all([
  trpc.post.byId.query(1),
  trpc.post.byId.query(2),
  trpc.post.byId.query(3),
]);
```

## `httpBatchLink` Options {#options}

The `httpBatchLink` function takes an options object that has the `HTTPBatchLinkOptions` shape.

```ts twoslash
type DataTransformerOptions = any;
type HTTPHeaders = Record<string, string | string[]>;
type Operation = {
  id: number;
  type: 'query' | 'mutation' | 'subscription';
  path: string;
  input: unknown;
};
// ---cut---
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

## Setting a maximum URL length

When sending batch requests, sometimes the URL can become too large causing HTTP errors like [`413 Payload Too Large`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/413), [`414 URI Too Long`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/414), and [`404 Not Found`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/404). The `maxURLLength` option will limit the number of requests that can be sent together in a batch.

> An alternative way of doing this is to

```ts twoslash title="client/index.ts"
// @filename: server.ts

// @filename: client.ts
// ---cut---
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import { initTRPC } from '@trpc/server';
import type { AppRouter } from './server';

const t = initTRPC.create();
export const appRouter = t.router({});
export type AppRouter = typeof appRouter;

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

```ts twoslash title="server.ts"
// @filename: router.ts
import { initTRPC } from '@trpc/server';
const t = initTRPC.create();
export const appRouter = t.router({});

// @filename: server.ts
// ---cut---
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import { appRouter } from './router';

createHTTPServer({
  router: appRouter,
  // 👇 disable batching
  allowBatching: false,
});
```

or, if you're using Next.js:

```ts twoslash title='pages/api/trpc/[trpc].ts'
// @filename: router.ts
import { initTRPC } from '@trpc/server';
const t = initTRPC.create();
export const appRouter = t.router({});

// @filename: pages/api/trpc/[trpc].ts
// ---cut---
import { createNextApiHandler } from '@trpc/server/adapters/next';
import { appRouter } from '../../../router';

export default createNextApiHandler({
  router: appRouter,
  // 👇 disable batching
  allowBatching: false,
});
```

### 2. Replace `httpBatchLink` with [`httpLink`](./httpLink.md) in your tRPC Client

```ts twoslash title="client/index.ts"
// @filename: server.ts

// @filename: client.ts
// ---cut---
import { createTRPCClient, httpLink } from '@trpc/client';
import { initTRPC } from '@trpc/server';
import type { AppRouter } from './server';

const t = initTRPC.create();
export const appRouter = t.router({});
export type AppRouter = typeof appRouter;

const client = createTRPCClient<AppRouter>({
  links: [
    httpLink({
      url: 'http://localhost:3000',
    }),
  ],
});
```

or, if you're using Next.js:

```tsx twoslash title='utils/trpc.ts'
// @filename: server.ts
import { httpLink } from '@trpc/client';
import { createTRPCNext } from '@trpc/next';
import { initTRPC } from '@trpc/server';
// @filename: utils/trpc.ts
// ---cut---
import type { AppRouter } from '../server';

const t = initTRPC.create();
export const appRouter = t.router({});
export type AppRouter = typeof appRouter;

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
