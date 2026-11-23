---
id: httpBatchLink
title: HTTP Batch Link
description: A terminating link that batches concurrent tRPC calls into a single HTTP request
sidebar_label: HTTP Batch Link
slug: /client/links/httpBatchLink
section: "Client Usage"
parent: "client/links"
order: 32
---

`httpBatchLink` is a [**terminating link**](../links.md#the-terminating-link) that batches an array of individual tRPC operations into a single HTTP request. A batch can include calls to different procedures (queries and mutations are batched separately).

## Usage

You can import and add the `httpBatchLink` to the `links` array as such:

```ts twoslash title="client/index.ts"
// @filename: server.ts
import { initTRPC } from '@trpc/server';
const t = initTRPC.create();
export const appRouter = t.router({});
export type AppRouter = typeof appRouter;

// @filename: client.ts
// ---cut---
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from './server';

const client = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: 'http://localhost:3000',
      // transformer,
    }),
  ],
});
```

After that, calls made in the same event loop tick are batched together, so you don't need `Promise.all`, though it's a common way to do it. The code below will produce exactly **one** HTTP request, and the server will call `createContext` **once** for it:

```ts twoslash
// @target: esnext
// @filename: server.ts
import { initTRPC } from '@trpc/server';
import { z } from 'zod';
const t = initTRPC.create();
export const appRouter = t.router({
  post: t.router({
    byId: t.procedure.input(z.number()).query(({ input }) => ({ id: input, title: `Post ${input}` })),
  }),
});
export type AppRouter = typeof appRouter;

// @filename: client.ts
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from './server';
const trpc = createTRPCClient<AppRouter>({ links: [httpBatchLink({ url: 'http://localhost:3000' })] });
// ---cut---
const somePosts = await Promise.all([
  trpc.post.byId.query(1),
  trpc.post.byId.query(2),
  trpc.post.byId.query(3),
]);
```

Each procedure still runs its own resolver, so whether this makes one database query depends on your data layer. Prisma [batches `findUnique()` calls made in the same tick](https://www.prisma.io/docs/orm/prisma-client/queries/query-optimization-performance#solving-the-n1-problem) into one query, and a [DataLoader](https://github.com/graphql/dataloader) can do the same for other queries. Otherwise, each resolver makes its own query.

## `httpBatchLink` Options {#options}

The `httpBatchLink` function takes an options object that has the `HTTPBatchLinkOptions` shape.

```ts twoslash
type DataTransformerOptions = any;
type HTTPHeaders = Record<string, string | string[]>;
type Operation = { id: number; type: 'query' | 'mutation' | 'subscription'; path: string; input: unknown };
type NonEmptyArray<T> = [T, ...T[]];
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
    | ((opts: { opList: NonEmptyArray<Operation> }) => HTTPHeaders | Promise<HTTPHeaders>);
  /**
   * Send all requests as POST requests regardless of the procedure type
   * The server must separately allow overriding the method. See:
   * @see https://trpc.io/docs/rpc
   */
  methodOverride?: 'POST';
  /**
   * The character between a procedure path's segments in URLs. Must match
   * the server's `pathSeparator`.
   * @default '.'
   * @see https://trpc.io/docs/rpc#path-separator
   */
  pathSeparator?: '.' | '_' | '~' | '-';
}
```

## Setting a maximum URL length

When sending batch requests, sometimes the URL can become too large causing HTTP errors like [`413 Payload Too Large`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/413), [`414 URI Too Long`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/414), and [`404 Not Found`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/404). The `maxURLLength` option will limit the number of requests that can be sent together in a batch.

```ts twoslash title="client/index.ts"
// @filename: server.ts
import { initTRPC } from '@trpc/server';
const t = initTRPC.create();
export const appRouter = t.router({});
export type AppRouter = typeof appRouter;

// @filename: client.ts
// ---cut---
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from './server';

const client = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: 'http://localhost:3000',
      maxURLLength: 2083, // a suitable size
      // alternatively, you can make all RPC-calls to be called with POST (also requires `allowMethodOverride: true` on the server)
      // methodOverride: 'POST',
    }),
  ],
});
```

## Limiting batch size

### 1. Set a maximum batch size on your server:

`maxBatchSize` limits how many operations may be sent in a single batch request. Requests exceeding this limit will be rejected with a `400 Bad Request` error. This can be passed to any tRPC adapter.

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
  maxBatchSize: 10,
});
```

or for example if using Next.js:

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
  maxBatchSize: 10,
});
```

### 2. Set a matching limit on the client:

Use the `maxItems` option on your batch link to ensure the client doesn't exceed the server's limit. This splits large batches into multiple HTTP requests automatically

```ts title="client/index.ts"
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from '../server';

const client = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: 'http://localhost:3000',
      // 👇 should be the same or lower than the server's maxBatchSize
      maxItems: 10,
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
    }),
  ],
});
```

With Next.js, it's the same: swap the link in the `createTRPCClient` you pass to `TRPCProvider`.
