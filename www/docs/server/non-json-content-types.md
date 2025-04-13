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

## `FormData` Input

FormData is natively supported, and for more advanced usage you could also combine this with a library like [zod-form-data](https://www.npmjs.com/package/zod-form-data) to validate inputs in a type-safe way.

```ts twoslash
// @target: esnext
import { initTRPC } from '@trpc/server';
// ---cut---

import { z } from 'zod';

export const t = initTRPC.create();
const publicProcedure = t.procedure;

export const appRouter = t.router({
  hello: publicProcedure.input(z.instanceof(FormData)).query((opts) => {
    const data = opts.input;
    //    ^?
    return {
      greeting: `Hello ${data.get('name')}`,
    };
  }),
});
```

For a more advanced code sample you can see our [example project here](https://github.com/juliusmarminge/trpc-interop/blob/66aa760141030ffc421cae1a3bda9b5f1ab340b6/src/server.ts#L28-L43)

## `File` and other Binary Type Inputs

tRPC converts many octet content types to a `ReadableStream` which can be consumed in a procedure. Currently these are `Blob` `Uint8Array` and `File`.

```ts twoslash
// @target: esnext
import { initTRPC } from '@trpc/server';
// ---cut---

import { octetInputParser } from '@trpc/server/http';

export const t = initTRPC.create();
const publicProcedure = t.procedure;

export const appRouter = t.router({
  upload: publicProcedure.input(octetInputParser).query((opts) => {
    const data = opts.input;
    //    ^?
    return {
      valid: true,
    };
  }),
});
```
