---
id: data-transformers
title: Data Transformers
sidebar_label: Data Transformers
slug: /server/data-transformers
---

You are able to serialize the response data & input args. The transformers need to be added both to the server and the client.

## Using [superjson](https://github.com/blitz-js/superjson)

SuperJSON allows us to transparently use, e.g., standard `Date`/`Map`/`Set`s over the wire between the server and client. That is, you can return any of these types from your API-resolver and use them in the client without having to recreate the objects from JSON.

### How to

#### 1. Install

```bash
yarn add superjson
```

#### 2. Add to your `initTRPC`

```ts twoslash title='routers/router/_app.ts'
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

## Using [devalue](https://github.com/Rich-Harris/devalue)

Devalue works like superjson, but focus in performance and compact payloads, but at the cost of a less human readable body.

### How to

#### 1. Install

```bash
yarn add devalue
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
