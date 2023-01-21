---
id: solid
title: Usage with SolidStart
sidebar_label: Solid
slug: /solid
---

## Example app

## How to add tRPC to existing SolidStart project

### 1. Install deps

```bash
yarn add @trpc/server zod
```

> [Zod](https://github.com/colinhacks/zod) isn't a required dependency, but it's used in the sample router below.

### 2. Create a tRPC router

Implement your tRPC router. A sample router is given below:

```ts title='/routes/api/trpc/[trpc].ts'
import { initTRPC } from '@trpc/server';
import { z } from 'zod';

export const t = initTRPC.create();

export const appRouter = t.router({
  getUser: t.procedure.input(z.string()).query((req) => {
    req.input; // string
    return { id: req.input, name: 'Bilbo' };
  }),
  createUser: t.procedure
    .input(z.object({ name: z.string().min(5) }))
    .mutation(async (req) => {
      // use your ORM of choice
      return await UserModel.create({
        data: req.input,
      });
    }),
});

// export type definition of API
export type AppRouter = typeof appRouter;
```

If your router file starts getting too big, split your router into several subrouters each implemented in its own file. Then [merge them](merging-routers) into a single root `appRouter`.

### 3. Use the SolidStart adapter

tRPC includes an adapter for SolidStart out of the box. This adapter lets you convert your tRPC router into a SolidStart API handler.

```ts title='/routes/api/trpc/[trpc].ts'
import { type inferAsyncReturnType, initTRPC } from '@trpc/server';
import {
  type CreateSolidContextOptions,
  createSolidApiHandler,
} from '@trpc/server/adapters/solid';

export const createContext = async (opts: CreateSolidContextOptions) => {
  return {
    req: opts.event.request,
    resHeaders: opts.resHeaders,
  };
};

export type IContext = inferAsyncReturnType<typeof createContext>;

const t = initTRPC.context<IContext>().create();
const appRouter = t.router({
  // [...]
});

export const { GET, POST } = createSolidApiHandler({
  router: appRouter,
  createContext,
});
```

Your endpoints are now available via HTTP!

| Endpoint     | HTTP URI                                                                                                       |
| ------------ | -------------------------------------------------------------------------------------------------------------- |
| `getUser`    | `GET http://localhost:5173/api/trpc/getUser?input=INPUT` <br/><br/>where `INPUT` is a URI-encoded JSON string. |
| `createUser` | `POST http://localhost:5173/api/trpc/createUser` <br/><br/>with `req.body` of type `{name: string}`            |
