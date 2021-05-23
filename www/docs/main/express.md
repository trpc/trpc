---
id: express
title: Usage with Express.js
sidebar_label: Usage with Express.js
slug: /express
---

## Install deps

```bash
yarn add @trpc/server zod
```

> [Zod](https://github.com/colinhacks/zod) isn't a required dependency, but it's used in the sample router below.

## Create a tRPC router

Implement your tRPC router. A sample router is given below:

```ts
import * as trpc from '@trpc/server';
import * as trpcNext from '@trpc/server/adapters/next';
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

If your router file starts getting too big, split your router into several subrouters each implemented in its own file. Then [merge them](/docs/merging-routers) into a single root `appRouter`.

## Express.js adapter

tRPC includes an adapter for Express.js out of the box. This adapter lets you convert your tRPC router into an Express.js middleware.

```ts
import { createExpressMiddleware } from '@trpc/server/adapters/express';

const appRouter = /* ... */;

const app = express();

app.use(
  '/trpc',
  createExpressMiddleware({
    router: appRouter,
    createContext: () => null, // no context
  })
);

app.listen(4000);
```

Your endpoints are now available via HTTP!

| Endpoint     | HTTP URI                                                                                              |
| ------------ | ----------------------------------------------------------------------------------------------------- |
| `getUser`    | `GET http://localhost:4000/getUser?input=INPUT` <br/><br/>where `INPUT` is a URI-encoded JSON string. |
| `createUser` | `POST http://localhost:4000/createUser` <br/><br/>with `req.body` of type `{name: string}`            |
