---
id: non-json-content-types
title: Content Types
sidebar_label: Content Types (JSON, FormData, File, Blob)
slug: /server/non-json-content-types
---

tRPC supports multiple content types as procedure inputs: JSON-serializable data, FormData, File, Blob, and other binary types.

## JSON (Default)

By default, tRPC sends and receives JSON-serializable data. No extra configuration is needed — any input that can be serialized to JSON works out of the box with all links (`httpLink`, `httpBatchLink`, `httpBatchStreamLink`).

```ts twoslash
// @target: esnext
import { initTRPC } from '@trpc/server';
// ---cut---

import { z } from 'zod';

export const t = initTRPC.create();
const publicProcedure = t.procedure;

export const appRouter = t.router({
  hello: publicProcedure.input(z.object({ name: z.string() })).query((opts) => {
    return { greeting: `Hello ${opts.input.name}` };
  }),
});
```

## Non-JSON Content Types

In addition to JSON, tRPC can use FormData, File, and other binary types as procedure inputs.

### Client Setup

:::info
While tRPC natively supports several non-JSON serializable types, your client may need a little link configuration to support them depending on your setup.
:::

`httpLink` supports non-JSON content types out of the box — if you're only using this link, your existing setup should work immediately.

```ts twoslash
// @filename: server.ts

// @filename: client.ts
// ---cut---
import { createTRPCClient, httpLink } from '@trpc/client';
import { initTRPC } from '@trpc/server';
import type { AppRouter } from './server';

const t = initTRPC.create();
export const appRouter = t.router({});
export type AppRouter = typeof appRouter;

createTRPCClient<AppRouter>({
  links: [
    httpLink({
      url: 'http://localhost:2022',
    }),
  ],
});
```

However, not all links support these content types. If you're using `httpBatchLink` or `httpBatchStreamLink`, you will need to include a `splitLink` and route requests based on the content type.

```ts twoslash
// @filename: server.ts

// @filename: client.ts
// ---cut---
import {
  createTRPCClient,
  httpBatchLink,
  httpLink,
  isNonJsonSerializable,
  splitLink,
} from '@trpc/client';
import { initTRPC } from '@trpc/server';
import type { AppRouter } from './server';

const t = initTRPC.create();
export const appRouter = t.router({});
export type AppRouter = typeof appRouter;

const url = 'http://localhost:2022';

createTRPCClient<AppRouter>({
  links: [
    splitLink({
      condition: (op) => isNonJsonSerializable(op.input),
      true: httpLink({
        url,
      }),
      false: httpBatchLink({
        url,
      }),
    }),
  ],
});
```

If you are using `transformer` in your tRPC server, TypeScript requires that your tRPC client link defines `transformer` as well.
Use this example as a base:

```ts twoslash
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
  httpLink,
  isNonJsonSerializable,
  splitLink,
} from '@trpc/client';
import superjson from 'superjson';
import type { AppRouter } from './server';

const url = 'http://localhost:2022';

createTRPCClient<AppRouter>({
  links: [
    splitLink({
      condition: (op) => isNonJsonSerializable(op.input),
      true: httpLink({
        url,
        transformer: {
          // request - convert data before sending to the tRPC server
          serialize: (data) => data,
          // response - convert the tRPC response before using it in client
          deserialize: (data) => superjson.deserialize(data), // or your other transformer
        },
      }),
      false: httpBatchLink({
        url,
        transformer: superjson, // or your other transformer
      }),
    }),
  ],
});
```

### Server Setup

:::info
When a request is handled by tRPC, it takes care of parsing the request body based on the `Content-Type` header of the request.  
If you encounter errors like `Failed to parse body as XXX`, make sure that your server (e.g., Express, Next.js) isn't parsing the request body before tRPC handles it.

```ts twoslash
// @filename: router.ts
import { initTRPC } from '@trpc/server';
const t = initTRPC.create();
export const appRouter = t.router({});

// @filename: app.ts
// ---cut---
// Example in express
import express from 'express';
import * as trpcExpress from '@trpc/server/adapters/express';
import { appRouter } from './router';

// incorrect
const app1 = express();
app1.use(express.json()); // this tries to parse body before tRPC.
app1.post('/express/hello', (req, res) => { res.end(); }); // normal express route handler
app1.use('/trpc', trpcExpress.createExpressMiddleware({ router: appRouter })); // tRPC fails to parse body

// correct
const app2 = express();
app2.use('/express', express.json()); // do it only in "/express/*" path
app2.post('/express/hello', (req, res) => { res.end(); });
app2.use('/trpc', trpcExpress.createExpressMiddleware({ router: appRouter })); // tRPC can parse body
```

:::

#### `FormData` Input

FormData is natively supported, and for more advanced usage you could also combine this with a library like [zod-form-data](https://www.npmjs.com/package/zod-form-data) to validate inputs in a type-safe way.

```ts twoslash
// @target: esnext
import { initTRPC } from '@trpc/server';
// ---cut---

import { z } from 'zod';

export const t = initTRPC.create();
const publicProcedure = t.procedure;

export const appRouter = t.router({
  hello: publicProcedure.input(z.instanceof(FormData)).mutation((opts) => {
    const data = opts.input;
    //    ^?
    return {
      greeting: `Hello ${data.get('name')}`,
    };
  }),
});
```

For a more advanced code sample you can see our [example project here](https://github.com/juliusmarminge/trpc-interop/blob/66aa760141030ffc421cae1a3bda9b5f1ab340b6/src/server.ts#L28-L43)

#### `File` and other Binary Type Inputs

tRPC converts many octet content types to a `ReadableStream` which can be consumed in a procedure. Currently these are `Blob` `Uint8Array` and `File`.

```ts twoslash
// @target: esnext
import { initTRPC } from '@trpc/server';
// ---cut---

import { octetInputParser } from '@trpc/server/http';

export const t = initTRPC.create();
const publicProcedure = t.procedure;

export const appRouter = t.router({
  upload: publicProcedure.input(octetInputParser).mutation((opts) => {
    const data = opts.input;
    //    ^?
    return {
      valid: true,
    };
  }),
});
```
