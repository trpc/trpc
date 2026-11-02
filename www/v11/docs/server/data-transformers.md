---
id: data-transformers
title: Data Transformers
sidebar_label: Data Transformers
slug: /server/data-transformers
section: "Backend Usage"
order: 23
skill:
  name: superjson
  package: "@trpc/client"
  type: composition
  requires:
    - server-setup
    - client-setup
  description: "Configure SuperJSON transformer on both server initTRPC.create({
    transformer: superjson }) and every client terminating link (httpBatchLink,
    httpLink, httpBatchStreamLink, wsLink, httpSubscriptionLink), including
    each splitLink branch, to support Date, Map, Set, BigInt over the wire.
    Transformer must match on both sides. In v11, transformer goes on
    individual links, not the client constructor. Also devalue, custom and
    separate input/output transformers."
---

You are able to serialize the response data & input args. The transformers need to be added both to the server and the client.

:::info
A transformer is optional. Without one, tRPC serializes data with `JSON.stringify`, so values that JSON can't represent don't round-trip: a `Date` arrives on the client as a string, and a `Map` or `Set` are always converted to an empty object (`{}`). Add a transformer like superjson (below) if you need those types preserved on the client.
:::

## Using [superjson](https://github.com/blitz-js/superjson)

SuperJSON allows us to transparently use, e.g., standard `Date`/`Map`/`Set`s over the wire between the server and client. That is, you can return any of these types from your API-resolver and use them in the client without having to recreate the objects from JSON.

### How to

#### 1. Install

```package-install
superjson
```

#### 2. Add to your `initTRPC`

```ts twoslash title='server/routers/_app.ts'
import { initTRPC } from '@trpc/server';
import superjson from 'superjson';

export const t = initTRPC.create({
  transformer: superjson,
});
```

#### 3. Add to `httpLink()`, `wsLink()`, etc

> TypeScript will guide you to where you need to add `transformer` as soon as you've added it on the `initTRPC`-object

`createTRPCClient()`:

```ts twoslash title='src/app/_trpc/client.ts'
// @filename: server.ts
import { initTRPC } from '@trpc/server';
import superjson from 'superjson';
const t = initTRPC.create({ transformer: superjson });
export const appRouter = t.router({});
export type AppRouter = typeof appRouter;

// @filename: client.ts
// ---cut---
import { createTRPCClient, httpLink } from '@trpc/client';
import type { AppRouter } from './server';
import superjson from 'superjson';

export const client = createTRPCClient<AppRouter>({
  links: [
    httpLink({
      url: 'http://localhost:3000',
      transformer: superjson,
    }),
  ],
});
```

Every terminating link needs the transformer, including both branches of a [`splitLink`](../client/links/splitLink.md). With [`wsLink`](../client/links/wsLink.md), it goes on `wsLink()`, not `createWSClient()`.

```ts twoslash title='src/app/_trpc/client.ts'
// @filename: server.ts
import { initTRPC } from '@trpc/server';
import superjson from 'superjson';
const t = initTRPC.create({ transformer: superjson });
export const appRouter = t.router({});
export type AppRouter = typeof appRouter;

// @filename: client.ts
// ---cut---
import {
  createTRPCClient,
  httpBatchLink,
  httpSubscriptionLink,
  splitLink,
} from '@trpc/client';
import type { AppRouter } from './server';
import superjson from 'superjson';

export const client = createTRPCClient<AppRouter>({
  links: [
    splitLink({
      condition: (op) => op.type === 'subscription',
      true: httpSubscriptionLink({
        url: 'http://localhost:3000',
        transformer: superjson,
      }),
      false: httpBatchLink({
        url: 'http://localhost:3000',
        transformer: superjson,
      }),
    }),
  ],
});
```

Now a `Date` returned by a procedure is a `Date` on the client:

```ts twoslash title='src/usage.ts'
// @target: esnext
// @filename: server.ts
import { initTRPC } from '@trpc/server';
import superjson from 'superjson';
const t = initTRPC.create({ transformer: superjson });
export const appRouter = t.router({
  event: t.procedure.query(() => ({ name: 'Launch', at: new Date() })),
});
export type AppRouter = typeof appRouter;

// @filename: client.ts
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from './server';
import superjson from 'superjson';
const client = createTRPCClient<AppRouter>({
  links: [httpBatchLink({ url: 'http://localhost:3000', transformer: superjson })],
});
// ---cut---
const event = await client.event.query();
event.at.getFullYear();
//    ^?
```

## Using [devalue](https://github.com/Rich-Harris/devalue)

Devalue works like superjson, focusing on performance and compact payloads, but at the cost of a less human-readable body.

### How to

#### 1. Install

```package-install
devalue
```

#### 2. Add to `utils/trpc.ts`

Here we use `parse` and `stringify` as they [mitigate XSS](https://github.com/Rich-Harris/devalue?tab=readme-ov-file#xss-mitigation).

```ts twoslash title='utils/trpc.ts'
// @filename: devalue.d.ts
declare module 'devalue' {
  export function parse(str: string): any;
  export function stringify(value: any): string;
}

// @filename: utils/trpc.ts
// ---cut---
import { parse, stringify } from 'devalue';

// [...]

export const transformer = {
  deserialize: (object: any) => parse(object),
  serialize: (object: any) => stringify(object),
};
```

#### 3. Add to your `initTRPC`

```ts twoslash title='server/routers/_app.ts'
// @filename: utils/trpc.ts
export const transformer = {
  deserialize: (object: any) => object,
  serialize: (object: any) => object,
};

// @filename: server/routers/_app.ts
// ---cut---
import { initTRPC } from '@trpc/server';
import { transformer } from '../../utils/trpc';

export const t = initTRPC.create({
  transformer,
});
```

#### 4. Add to `httpLink()`, `wsLink()`, etc

> TypeScript will guide you to where you need to add `transformer` as soon as you've added it on the `initTRPC`-object

`createTRPCClient()`:

```ts twoslash title='src/app/_trpc/client.ts'
// @filename: utils/trpc.ts
export const transformer = {
  deserialize: (object: any) => object,
  serialize: (object: any) => object,
};

// @filename: server/routers/_app.ts
import { initTRPC } from '@trpc/server';
import { transformer } from '../../utils/trpc';
const t = initTRPC.create({ transformer });
export const appRouter = t.router({});
export type AppRouter = typeof appRouter;

// @filename: client.ts
// ---cut---
import { createTRPCClient, httpLink } from '@trpc/client';
import type { AppRouter } from './server/routers/_app';
import { transformer } from './utils/trpc';

export const client = createTRPCClient<AppRouter>({
  links: [
    httpLink({
      url: 'http://localhost:3000',
      transformer,
    }),
  ],
});
```

## Different transformers for upload and download

If a transformer should only be used for one direction or different transformers should be used for upload and download (e.g., for performance reasons), you can provide individual transformers for upload and download. Make sure you use the same combined transformer everywhere.

## `DataTransformer` interface

```ts twoslash
export interface DataTransformer {
  serialize(object: any): any;
  deserialize(object: any): any;
}

interface InputDataTransformer extends DataTransformer {
  /**
   * This function runs **on the client** before sending the data to the server.
   */
  serialize(object: any): any;
  /**
   * This function runs **on the server** to transform the data before it is passed to the resolver
   */
  deserialize(object: any): any;
}

interface OutputDataTransformer extends DataTransformer {
  /**
   * This function runs **on the server** before sending the data to the client.
   */
  serialize(object: any): any;
  /**
   * This function runs **only on the client** to transform the data sent from the server.
   */
  deserialize(object: any): any;
}

export interface CombinedDataTransformer {
  /**
   * Specify how the data sent from the client to the server should be transformed.
   */
  input: InputDataTransformer;
  /**
   * Specify how the data sent from the server to the client should be transformed.
   */
  output: OutputDataTransformer;
}
```

## Common mistakes

- **A transformer on only one side, or on only some links.** As long as the client is typed with your `AppRouter`, TypeScript catches this: a link without `transformer` fails with `Property 'transformer' is missing`, and a `transformer` on the client when the server has none fails with ``You must define a transformer on your `initTRPC`-object first``. If the types are bypassed, the mismatch shows up at runtime instead: data arrives still encoded (superjson's `{ json, meta }` wrapper), or calls fail with `Unable to transform response from server`.
- **Creating a link outside the `links` array.** A link created on its own, for example inside a custom link, isn't checked against your router, so a missing transformer isn't reported. Pass the router type, as in `httpBatchLink<AppRouter>({ url, transformer })`, to get the check back.
- **Passing `transformer` to `createTRPCClient()`.** TypeScript rejects it with `The transformer property has moved to httpLink/httpBatchLink/wsLink`.
- **Forgetting to transform data you hydrate yourself.** The links only transform tRPC requests and responses. If you dehydrate a TanStack Query cache on the server and hydrate it on the client, also set `serializeData` and `deserializeData`, as shown in [the Query Client factory](../client/tanstack-react-query/server-components.md#3-create-a-query-client-factory).
