---
name: non-json-content-types
description: >
  Handle FormData, file uploads, Blob, Uint8Array, and ReadableStream inputs in
  tRPC mutations. Use octetInputParser from @trpc/server/http for binary data.
  Route non-JSON requests with splitLink and isNonJsonSerializable() from
  @trpc/client. FormData and binary inputs only work with mutations (POST).
type: core
library: trpc
library_version: '11.15.1'
requires:
  - server-setup
  - links
sources:
  - 'trpc/trpc:www/docs/server/non-json-content-types.md'
  - 'trpc/trpc:examples/next-formdata/'
---

# tRPC -- Non-JSON Content Types

## Setup

Server:

```ts
// server/trpc.ts
import { initTRPC } from '@trpc/server';

const t = initTRPC.create();

export const router = t.router;
export const publicProcedure = t.procedure;
```

```ts
// server/appRouter.ts
import { octetInputParser } from '@trpc/server/http';
import { z } from 'zod';
import { publicProcedure, router } from './trpc';

export const appRouter = router({
  uploadForm: publicProcedure
    .input(z.instanceof(FormData))
    .mutation(({ input }) => {
      const name = input.get('name');
      return { greeting: `Hello ${name}` };
    }),
  uploadFile: publicProcedure.input(octetInputParser).mutation(({ input }) => {
    // input is a ReadableStream
    return { valid: true };
  }),
});

export type AppRouter = typeof appRouter;
```

Client:

```ts
// client/index.ts
import {
  createTRPCClient,
  httpBatchLink,
  httpLink,
  isNonJsonSerializable,
  splitLink,
} from '@trpc/client';
import type { AppRouter } from '../server/appRouter';

const url = 'http://localhost:3000';

const trpc = createTRPCClient<AppRouter>({
  links: [
    splitLink({
      condition: (op) => isNonJsonSerializable(op.input),
      true: httpLink({ url }),
      false: httpBatchLink({ url }),
    }),
  ],
});
```

## Core Patterns

### FormData mutation

```ts
// server/appRouter.ts
import { z } from 'zod';
import { publicProcedure, router } from './trpc';

export const appRouter = router({
  createPost: publicProcedure
    .input(z.instanceof(FormData))
    .mutation(({ input }) => {
      const title = input.get('title') as string;
      const body = input.get('body') as string;
      return { id: '1', title, body };
    }),
});
```

```ts
// client usage
const form = new FormData();
form.append('title', 'Hello');
form.append('body', 'World');

const result = await trpc.createPost.mutate(form);
```

### Binary file upload with octetInputParser

```ts
// server/appRouter.ts
import { octetInputParser } from '@trpc/server/http';
import { publicProcedure, router } from './trpc';

export const appRouter = router({
  upload: publicProcedure
    .input(octetInputParser)
    .mutation(async ({ input }) => {
      const reader = input.getReader();
      let totalBytes = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        totalBytes += value.byteLength;
      }
      return { totalBytes };
    }),
});
```

```ts
// client usage
const file = new File(['hello world'], 'test.txt', { type: 'text/plain' });
const result = await trpc.upload.mutate(file);
```

`octetInputParser` converts Blob, Uint8Array, and File inputs to a ReadableStream on the server.

### Client splitLink with superjson transformer

```ts
import {
  createTRPCClient,
  httpBatchLink,
  httpLink,
  isNonJsonSerializable,
  splitLink,
} from '@trpc/client';
import superjson from 'superjson';
import type { AppRouter } from '../server/appRouter';

const url = 'http://localhost:3000';

const trpc = createTRPCClient<AppRouter>({
  links: [
    splitLink({
      condition: (op) => isNonJsonSerializable(op.input),
      true: httpLink({
        url,
        transformer: {
          serialize: (data) => data,
          deserialize: (data) => superjson.deserialize(data),
        },
      }),
      false: httpBatchLink({
        url,
        transformer: superjson,
      }),
    }),
  ],
});
```

When using a transformer, the non-JSON httpLink needs a custom transformer that skips serialization for the request (FormData/binary cannot be transformed) but deserializes the response.

## Common Mistakes

### [HIGH] Using httpBatchLink for FormData requests

Wrong:

```ts
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from '../server/appRouter';

const trpc = createTRPCClient<AppRouter>({
  links: [httpBatchLink({ url: 'http://localhost:3000' })],
});
```

Correct:

```ts
import {
  createTRPCClient,
  httpBatchLink,
  httpLink,
  isNonJsonSerializable,
  splitLink,
} from '@trpc/client';
import type { AppRouter } from '../server/appRouter';

const url = 'http://localhost:3000';

const trpc = createTRPCClient<AppRouter>({
  links: [
    splitLink({
      condition: (op) => isNonJsonSerializable(op.input),
      true: httpLink({ url }),
      false: httpBatchLink({ url }),
    }),
  ],
});
```

FormData and binary inputs are not batchable; use `splitLink` with `isNonJsonSerializable()` to route them through `httpLink`.

Source: www/docs/server/non-json-content-types.md

### [HIGH] Global body parser intercepting FormData before tRPC

Wrong:

```ts
import * as trpcExpress from '@trpc/server/adapters/express';
import express from 'express';
import { appRouter } from './appRouter';

const app = express();
app.use(express.json());
app.use('/trpc', trpcExpress.createExpressMiddleware({ router: appRouter }));
```

Correct:

```ts
import * as trpcExpress from '@trpc/server/adapters/express';
import express from 'express';
import { appRouter } from './appRouter';

const app = express();
app.use('/api', express.json());
app.use('/trpc', trpcExpress.createExpressMiddleware({ router: appRouter }));
```

A global `express.json()` middleware consumes the request body before tRPC can read it; scope body parsing to non-tRPC routes only.

Source: www/docs/server/non-json-content-types.md

### [HIGH] FormData only works with mutations

FormData and binary inputs are only supported for mutations (POST requests). Using them with `.query()` throws an error because queries use HTTP GET which cannot carry a request body.

Source: www/docs/server/non-json-content-types.md

## See Also

- `server-setup` -- initTRPC, routers, procedures
- `links` -- splitLink configuration for routing non-JSON requests
- `validators` -- z.instanceof(FormData) for FormData validation
- `adapter-express` -- Express-specific body parser considerations
