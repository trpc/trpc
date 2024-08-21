---
id: express
title: Express Adapter
sidebar_label: Express
slug: /server/adapters/express
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

```ts title='server.ts'
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
      return await UserModel.create({
        data: opts.input,
      });
    }),
});

// export type definition of API
export type AppRouter = typeof appRouter;
```

If your router file starts getting too big, split your router into several subrouters each implemented in its own file. Then [merge them](/docs/server/merging-routers) into a single root `appRouter`.

### 3. Use the Express adapter

tRPC includes an adapter for Express out of the box. This adapter lets you convert your tRPC router into an Express middleware.

```ts title='server.ts'
import { initTRPC } from '@trpc/server';
import * as trpcExpress from '@trpc/server/adapters/express';

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
