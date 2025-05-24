---
id: non-json-content-types
title: Non-JSON Content Types
sidebar_label: Non-JSON Inputs (FormData, File, Blob)
slug: /server/non-json-content-types
---

In addition to JSON-serializable data, tRPC can use FormData, File, and other Binary types as procedure inputs

## Client Setup

:::info
While tRPC natively supports several non-json serializable types, your client may need a little link configuration to support them depending on your setup.
:::

`httpLink` supports non-json content types out the box, if you're only using this then your existing setup should work immediately

```ts
import { httpLink } from '@trpc/client';

trpc.createClient({
  links: [
    httpLink({
      url: 'http://localhost:2022',
    }),
  ],
});
```

However, not all links support these new content types, if you're using `httpBatchLink` or `httpBatchStreamLink` you will need to include a splitLink and check which link to use depending on the content

```ts
import {
  httpBatchLink,
  httpLink,
  isNonJsonSerializable,
  splitLink,
} from '@trpc/client';

trpc.createClient({
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

## Server Usage

:::info
When a request is handled by tRPC, tRPC handles body parsing (based on request header `Content-Type`).  
If you encounter weird errors like `Failed to parse body as XXX` check that your server (express, next.js...) that mounts tRPC isn't parsing the request body before tRPC.  
If yes, exclude the body parsing in routes handled by tRPC.

```ts
// Example in express

// incorrect
const app = express();
app.use(express.json()); // this try to parse body before tRPC.
app.post('/express/hello', (req,res) => {/* ... */ }); // normal express route handler
app.use('/trpc', trpcExpress.createExpressMiddleware({ /* ... */}))// tRPC fails to parse body

// correct
const app = express();
app.use('/express', express.json()); // do it only in "/express/*" path
app.post('/express/hello', (req,res) => {/* ... */ });
app.use('/trpc', trpcExpress.createExpressMiddleware({ /* ... */}))// tRPC can parse body
```

:::

### `FormData` Input

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

### `File` and other Binary Type Inputs

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
