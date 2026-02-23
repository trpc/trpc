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

If you are using `transformer` in your tRPC server, typescript requires that your tRPC client link defines `transformer` as well.  
Use this example as base:

```ts
import {
  httpBatchLink,
  httpLink,
  isNonJsonSerializable,
  splitLink,
} from '@trpc/client';
import superjson from 'superjson';

trpc.createClient({
  links: [
    splitLink({
      condition: (op) => isNonJsonSerializable(op.input),
      true: httpLink({
        url,
        transformer: {
          // request - convert data before sending to the tRPC server
          serialize: (data) => data,
          // response - convert the tRPC response before using it in client
          deserialize: superjson.deserialize, // or your other transformer
        },
      }),
      false: httpBatchLink({
        url,
        transformers: superjson, // or your other transformer
      }),
    }),
  ],
});
```

## Server Usage

:::info
When a request is handled by tRPC, it takes care of parsing the request body based on the `Content-Type` header of the request.  
If you encounter errors like `Failed to parse body as XXX`, make sure that your server (e.g., Express, Next.js) isn't parsing the request body before tRPC handles it.

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

### Using Data Transformers with Non-JSON Inputs

By default, non-JSON inputs like `FormData` and binary types bypass the data transformer — they are sent as-is from the client and arrive as-is on the server. This means that even if you have a transformer like `superjson` configured, it will not run on these input types.

If you want your transformer to process these types (for example, to convert a `FormData` into a custom serialization format), you can opt in with two flags on the input transformer:

- **`unstable_serializeNonJsonTypes`** — when `true`, the client-side `serialize()` function will be called on `FormData`, `Blob`, and `Uint8Array` inputs before sending them.
- **`unstable_deserializeNonJsonTypes`** — when `true`, the server-side `deserialize()` function will be called on `FormData` and `ReadableStream` inputs before passing them to the resolver.

These flags are independent — you can use one without the other.

#### Example: Serializing FormData to JSON on the client

If `serialize()` converts a `FormData` into a plain object, the request will be sent as `application/json` instead of `multipart/form-data`:

```ts
const transformer = {
  input: {
    serialize(obj) {
      if (obj instanceof FormData) {
        const data = {};
        obj.forEach((v, k) => {
          data[k] = String(v);
        });
        return data;
      }
      return obj;
    },
    deserialize: (obj) => obj,
    unstable_serializeNonJsonTypes: true,
  },
  output: {
    serialize: (obj) => obj,
    deserialize: (obj) => obj,
  },
};
```

#### Example: Deserializing FormData on the server

If you want the server-side transformer to convert `FormData` before it reaches the resolver:

```ts
const transformer = {
  input: {
    serialize: (obj) => obj,
    deserialize(obj) {
      if (obj instanceof FormData) {
        const data = {};
        obj.forEach((v, k) => {
          data[k] = String(v);
        });
        return data;
      }
      return obj;
    },
    unstable_deserializeNonJsonTypes: true,
  },
  output: {
    serialize: (obj) => obj,
    deserialize: (obj) => obj,
  },
};
```

#### Example: Converting plain objects to FormData in the serializer

The serializer can also _return_ a `FormData` or binary type from a plain object input. tRPC will detect the output type and set the correct `Content-Type` header automatically:

```ts
const transformer = {
  input: {
    serialize(obj) {
      // Convert plain object → FormData on the client
      const fd = new FormData();
      fd.set('payload', JSON.stringify(obj));
      return fd;
    },
    deserialize(obj) {
      // Convert FormData → plain object on the server
      if (obj instanceof FormData) {
        return JSON.parse(obj.get('payload'));
      }
      return obj;
    },
    unstable_deserializeNonJsonTypes: true,
  },
  output: {
    serialize: (obj) => obj,
    deserialize: (obj) => obj,
  },
};
```

:::note
Batch links (`httpBatchLink` and `httpBatchStreamLink`) do not support `FormData` or binary type inputs. If the transformer returns a `FormData` or binary type, batch links will throw an error. Use `httpLink` or a `splitLink` for these cases.
:::

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
