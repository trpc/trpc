---
id: non-json-content-types
title: Content Types
sidebar_label: Content Types (JSON, FormData, File, Blob)
slug: /server/non-json-content-types
section: "Backend Usage"
order: 24
skill:
  name: non-json-content-types
  package: "@trpc/server"
  type: core
  requires:
    - server-setup
    - links
  description: Handle FormData, file uploads, Blob, Uint8Array, and ReadableStream
    inputs in tRPC mutations. Use octetInputParser from @trpc/server/http for
    binary data. Route non-JSON requests with splitLink and
    isNonJsonSerializable() from @trpc/client, since batching links send them
    as `{}`. FormData and binary inputs are sent as POST, so they only work
    with mutations unless httpLink sets methodOverride to 'POST', and they
    skip the transformer. Keep Express or Next.js body parsers off tRPC
    routes.
  include:
    - server/adapters/express#body-parsers
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
import { initTRPC } from '@trpc/server';
const t = initTRPC.create();
export const appRouter = t.router({});
export type AppRouter = typeof appRouter;

// @filename: client.ts
// ---cut---
import { createTRPCClient, httpLink } from '@trpc/client';
import type { AppRouter } from './server';

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
import { initTRPC } from '@trpc/server';
const t = initTRPC.create();
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
import type { AppRouter } from './server';

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
If you encounter errors like `Failed to parse body as XXX`, make sure that your server (e.g., Express, Next.js) isn't parsing the request body before tRPC handles it:

- Express: see [Body parsers](./adapters/express.md#body-parsers).
- Next.js Pages Router: turn off Next's body parser in the tRPC API route with `export const config = { api: { bodyParser: false } }`, as in our [FormData example](https://github.com/trpc/trpc/tree/main/examples/next-formdata).

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

On the client, pass a `FormData` instance to the mutation:

```ts twoslash
// @target: esnext
// @filename: server.ts
import { initTRPC } from '@trpc/server';
import { z } from 'zod';
const t = initTRPC.create();
export const appRouter = t.router({
  hello: t.procedure
    .input(z.instanceof(FormData))
    .mutation((opts) => ({ greeting: `Hello ${opts.input.get('name')}` })),
});
export type AppRouter = typeof appRouter;

// @filename: client.ts
import { createTRPCClient, httpLink } from '@trpc/client';
import type { AppRouter } from './server';
const client = createTRPCClient<AppRouter>({
  links: [httpLink({ url: 'http://localhost:2022' })],
});
// ---cut---
const form = new FormData();
form.append('name', 'Bilbo');

const result = await client.hello.mutate(form);
//    ^?
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
  upload: publicProcedure.input(octetInputParser).mutation(async (opts) => {
    const data = opts.input;
    //    ^?
    const reader = data.getReader();
    let bytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
    }
    return { bytes };
  }),
});
```

On the client, pass a `File`, `Blob` or `Uint8Array` to the mutation:

```ts twoslash
// @target: esnext
// @filename: server.ts
import { initTRPC } from '@trpc/server';
import { octetInputParser } from '@trpc/server/http';
const t = initTRPC.create();
export const appRouter = t.router({
  upload: t.procedure.input(octetInputParser).mutation(() => ({ bytes: 0 })),
});
export type AppRouter = typeof appRouter;

// @filename: client.ts
import { createTRPCClient, httpLink } from '@trpc/client';
import type { AppRouter } from './server';
const client = createTRPCClient<AppRouter>({
  links: [httpLink({ url: 'http://localhost:2022' })],
});
// ---cut---
const file = new File(['hello world'], 'hello.txt', { type: 'text/plain' });

await client.upload.mutate(file);
```

## Common mistakes

- **Using a query.** FormData and binary inputs are sent as the body of a `POST` request, so they only work with mutations: for a query, `httpLink` throws `FormData is only supported for mutations` or `Octet type input is only supported for mutations`. The exception is an `httpLink` with `methodOverride: 'POST'`, which sends every call as a `POST` and so also sends FormData and binary inputs for queries; the server must [allow the method override](/docs/rpc#overriding-the-default-http-method).
- **Sending them through a batching link.** `httpBatchLink`, `httpBatchStreamLink` and `wsLink` (with its default encoder) serialize inputs as JSON, which turns a `FormData` or `File` into `{}`, so input validation fails. Route them to `httpLink` with a [`splitLink`](#client-setup). Only `httpLink` sends non-JSON inputs:

  | Link                                                            | `application/json` | `FormData`  | `File` / `Blob` / `Uint8Array` |
  | --------------------------------------------------------------- | :----------------: | :---------: | :----------------------------: |
  | [`httpLink`](/docs/client/links/httpLink)                       |         ✅         | ✅ (`POST`) |          ✅ (`POST`)           |
  | [`httpBatchLink`](/docs/client/links/httpBatchLink)             |         ✅         |     ❌      |               ❌               |
  | [`httpBatchStreamLink`](/docs/client/links/httpBatchStreamLink) |         ✅         |     ❌      |               ❌               |
  | [`wsLink`](/docs/server/websockets)                             |         ✅         |     ❌      |               ❌               |

  With a binary `experimental_encoder` such as MessagePack, `wsLink` can carry `Uint8Array` values, as in the [WebSocket encoder example](https://github.com/trpc/trpc/tree/main/examples/next-websockets-encoder).
- **Transforming the request.** tRPC passes FormData and binary inputs to your procedure as they are, without your `transformer`. If you use one, give the non-JSON `httpLink` a transformer that leaves the request alone, as [shown above](#client-setup).
- **Letting your server parse the body first.** See [Server Setup](#server-setup).
