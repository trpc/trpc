---
name: adapter-express
description: >
  Mount tRPC as Express middleware with createExpressMiddleware() from
  @trpc/server/adapters/express. Access Express req/res in createContext via
  CreateExpressContextOptions. Mount at a path prefix like app.use('/trpc', ...).
  Avoid global express.json() conflicting with tRPC body parsing for FormData.
type: core
library: trpc
library_version: '11.15.1'
requires:
  - server-setup
sources:
  - www/docs/server/adapters/express.md
  - examples/express-server/src/server.ts
---

# tRPC — Adapter: Express

## Setup

```ts
// server.ts
import { initTRPC } from '@trpc/server';
import * as trpcExpress from '@trpc/server/adapters/express';
import express from 'express';
import { z } from 'zod';

const createContext = ({
  req,
  res,
}: trpcExpress.CreateExpressContextOptions) => {
  return { req, res };
};
type Context = Awaited<ReturnType<typeof createContext>>;

const t = initTRPC.context<Context>().create();

const appRouter = t.router({
  greet: t.procedure
    .input(z.object({ name: z.string() }))
    .query(({ input }) => ({ greeting: `Hello, ${input.name}!` })),
});

export type AppRouter = typeof appRouter;

const app = express();

app.use(
  '/trpc',
  trpcExpress.createExpressMiddleware({
    router: appRouter,
    createContext,
  }),
);

app.listen(4000, () => {
  console.log('Listening on http://localhost:4000');
});
```

## Core Patterns

### Accessing Express req/res in context

```ts
import * as trpcExpress from '@trpc/server/adapters/express';

const createContext = ({
  req,
  res,
}: trpcExpress.CreateExpressContextOptions) => {
  const token = req.headers.authorization?.split(' ')[1];
  return { token, res };
};

type Context = Awaited<ReturnType<typeof createContext>>;
```

`CreateExpressContextOptions` provides typed access to the Express `req` (IncomingMessage) and `res` (ServerResponse).

### Adding tRPC alongside existing Express routes

```ts
import * as trpcExpress from '@trpc/server/adapters/express';
import cors from 'cors';
import express from 'express';
import { createContext } from './context';
import { appRouter } from './router';

const app = express();

app.use(cors());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use(
  '/trpc',
  trpcExpress.createExpressMiddleware({
    router: appRouter,
    createContext,
  }),
);

app.listen(4000);
```

### Limiting batch size with maxBatchSize

```ts
import * as trpcExpress from '@trpc/server/adapters/express';
import express from 'express';
import { createContext } from './context';
import { appRouter } from './router';

const app = express();

app.use(
  '/trpc',
  trpcExpress.createExpressMiddleware({
    router: appRouter,
    createContext,
    maxBatchSize: 10,
  }),
);

app.listen(4000);
```

Requests batching more than `maxBatchSize` operations are rejected with a `400 Bad Request` error. Set `maxItems` on your client's `httpBatchLink` to the same value to avoid exceeding the limit.

## Common Mistakes

### HIGH Global express.json() consuming tRPC request body

Wrong:

```ts
const app = express();
app.use(express.json()); // global body parser
app.use(
  '/trpc',
  trpcExpress.createExpressMiddleware({
    router: appRouter,
    createContext,
  }),
);
```

Correct:

```ts
const app = express();
// Only apply body parser to non-tRPC routes
app.use('/api', express.json());
app.use(
  '/trpc',
  trpcExpress.createExpressMiddleware({
    router: appRouter,
    createContext,
  }),
);
```

If `express.json()` is applied globally before the tRPC middleware, it consumes and parses the request body. tRPC then receives an already-parsed body, which breaks FormData and binary content type handling.

Source: www/docs/server/non-json-content-types.md

## See Also

- **server-setup** -- `initTRPC.create()`, router/procedure definition, context
- **adapter-standalone** -- simpler adapter when Express middleware ecosystem is not needed
- **auth** -- extracting JWT from `req.headers.authorization` in context
- Express docs: https://expressjs.com/en/guide/using-middleware.html
