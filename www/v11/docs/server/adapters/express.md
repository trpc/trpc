---
id: express
title: Express Adapter
sidebar_label: Express
slug: /server/adapters/express
section: "Backend Usage"
parent: "server/adapters"
order: 14
skill:
  name: adapter-express
  package: '@trpc/server'
  type: core
  requires:
    - server-setup
  description: >
    Mount tRPC as Express middleware with createExpressMiddleware() from
    @trpc/server/adapters/express. Access Express req/res in createContext via
    CreateExpressContextOptions. Mount at a path prefix like
    app.use('/trpc', ...). Adapter options: onError, maxBatchSize,
    maxBodySize, middleware. Body parsers registered before tRPC (Express 4's
    express.json(), or express.raw()) break FormData and binary inputs, so
    scope them to non-tRPC routes.
  include:
    - server/adapters#common-options
---

## Example app

<table>
  <thead>
    <tr>
      <th>Description</th>
      <th>Links</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Express server &amp; procedure calls with Node.js.</td>
      <td>
        <ul>
          <li><a href="https://githubbox.com/trpc/trpc/tree/main/examples/express-server">CodeSandbox</a></li>
          <li><a href="https://github.com/trpc/trpc/tree/main/examples/express-server">Source</a></li>
        </ul>
      </td>
    </tr>
  </tbody>
</table>

## How to add tRPC to existing Express project

### 1. Install deps

```bash
yarn add @trpc/server zod
```

> [Zod](https://github.com/colinhacks/zod) isn't a required dependency, but it's used in the sample router below.

### 2. Create a tRPC router

Implement your tRPC router. A sample router is given below:

```ts twoslash title='server.ts'
import { initTRPC } from '@trpc/server';
import { z } from 'zod';

export const t = initTRPC.create();

export const appRouter = t.router({
  getUser: t.procedure.input(z.string()).query((opts) => {
    opts.input; // string
    return { id: opts.input, name: 'Bilbo' };
  }),
  createUser: t.procedure
    .input(z.object({ name: z.string().min(5) }))
    .mutation(async (opts) => {
      // use your ORM of choice
      return { id: '1', ...opts.input };
    }),
});

// export type definition of API
export type AppRouter = typeof appRouter;
```

If your router file starts getting too big, split your router into several subrouters each implemented in its own file. Then [merge them](/docs/server/merging-routers) into a single root `appRouter`.

### 3. Use the Express adapter

tRPC includes an adapter for Express out of the box. This adapter lets you convert your tRPC router into an Express middleware.

```ts twoslash title='server.ts'
import { initTRPC } from '@trpc/server';
import * as trpcExpress from '@trpc/server/adapters/express';
import express from 'express';

// created for each request
const createContext = ({
  req,
  res,
}: trpcExpress.CreateExpressContextOptions) => ({}); // no context
type Context = Awaited<ReturnType<typeof createContext>>;

const t = initTRPC.context<Context>().create();
const appRouter = t.router({
  // [...]
});

const app = express();

app.use(
  '/trpc',
  trpcExpress.createExpressMiddleware({
    router: appRouter,
    createContext,
  }),
);

app.listen(4000);
```

Your endpoints are now available via HTTP!

| Endpoint     | HTTP URI                                                                                                   |
| ------------ | ---------------------------------------------------------------------------------------------------------- |
| `getUser`    | `GET http://localhost:4000/trpc/getUser?input=INPUT` <br/><br/>where `INPUT` is a URI-encoded JSON string. |
| `createUser` | `POST http://localhost:4000/trpc/createUser` <br/><br/>with `req.body` of type `{name: string}`            |

`createContext` receives Express's `req` and `res`, so you can, for example, read `req.headers.authorization` to [authorize the user](../authorization.md). The middleware accepts the [options every adapter takes](../adapters.md#common-options), like `onError` and `maxBatchSize`, plus `middleware` and `maxBodySize`.

## Body parsers

tRPC parses request bodies itself, so tRPC routes don't need `express.json()`. If a body parser runs before tRPC anyway, tRPC uses the `req.body` it parsed, which works for JSON. For [FormData and binary inputs](../non-json-content-types.md) it depends on your Express version:

- **Express 5**: `express.json()` and `express.urlencoded()` leave other content types unread, so tRPC still reads them.
- **Express 4**: the parsers set `req.body` to `{}` on content types they skip, so tRPC receives `{}` instead of the form data or file.
- In both versions, a parser that reads the body you upload, like `express.raw()` for `application/octet-stream`, breaks binary inputs.

To be safe, register body parsers only on the routes that need them:

```ts twoslash title='server.ts'
// @filename: router.ts
import { initTRPC } from '@trpc/server';
const t = initTRPC.create();
export const appRouter = t.router({});

// @filename: server.ts
// ---cut---
import * as trpcExpress from '@trpc/server/adapters/express';
import express from 'express';
import { appRouter } from './router';

const app = express();

app.use('/api', express.json()); // only for your own `/api/*` routes
app.post('/api/webhook', (req, res) => {
  res.json({ received: req.body });
});

app.use('/trpc', trpcExpress.createExpressMiddleware({ router: appRouter }));

app.listen(4000);
```
