---
id: express
title: Usage with Express.js
sidebar_label: 'Adapter: Express.js'
slug: /express
---

## Example app

<table>
  <thead>
    <tr>
      <th>Description</th>
      <th>URL</th>
      <th>Links</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Express server &amp; procedure calls with node.js.</td>
      <td><em>n/a</em></td>
      <td>
        <ul>
          <li><a href="https://githubbox.com/trpc/trpc/tree/main/examples/express-server">CodeSandbox</a></li>
          <li><a href="https://github.com/trpc/trpc/tree/main/examples/express-server">Source</a></li>
        </ul>
      </td>
    </tr>
  </tbody>
</table>

## How to add tRPC to existing Express.js project

### 1. Install deps

```bash
yarn add @trpc/server zod
```

> [Zod](https://github.com/colinhacks/zod) isn't a required dependency, but it's used in the sample router below.

### 2. Create a tRPC router

Implement your tRPC router. A sample router is given below:

```ts title='server.ts'
import * as trpc from '@trpc/server';
import { z } from 'zod';

const appRouter = trpc
  .router()
  .query('getUser', {
    input: z.string(),
    async resolve(req) {
      req.input; // string
      return { id: req.input, name: 'Bilbo' };
    },
  })
  .mutation('createUser', {
    // validate input with Zod
    input: z.object({ name: z.string().min(5) }),
    async resolve(req) {
      // use your ORM of choice
      return await UserModel.create({
        data: req.input,
      });
    },
  });

// export type definition of API
export type AppRouter = typeof appRouter;
```

If your router file starts getting too big, split your router into several subrouters each implemented in its own file. Then [merge them](merging-routers) into a single root `appRouter`.

### 3. Use the Express.js adapter

tRPC includes an adapter for Express.js out of the box. This adapter lets you convert your tRPC router into an Express.js middleware.

```ts title='server.ts'
import * as trpcExpress from '@trpc/server/adapters/express';

const appRouter = /* ... */;

const app = express();

// created for each request
const createContext = ({
  req,
  res,
}: trpcExpress.CreateExpressContextOptions) => ({}) // no context
type Context = trpc.inferAsyncReturnType<typeof createContext>;

app.use(
  '/trpc',
  trpcExpress.createExpressMiddleware({
    router: appRouter,
    createContext,
  })
);

app.listen(4000);
```

Your endpoints are now available via HTTP!

| Endpoint     | HTTP URI                                                                                                   |
| ------------ | ---------------------------------------------------------------------------------------------------------- |
| `getUser`    | `GET http://localhost:4000/trpc/getUser?input=INPUT` <br/><br/>where `INPUT` is a URI-encoded JSON string. |
| `createUser` | `POST http://localhost:4000/trpc/createUser` <br/><br/>with `req.body` of type `{name: string}`            |
