---
id: fetch
title: Usage with the Fetch API
sidebar_label: Fetch
slug: /fetch
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
      <td>
        <ul>
          <li>Cloudflare Workers example</li>
          <li>Simple TRPC client in node</li>
        </ul>
      </td>
      <td>
        <ul>
          <li><a href="https://github.com/trpc/trpc/tree/next/examples/cloudflare-workers">Source</a></li>
        </ul>
      </td>
    </tr>
  </tbody>
</table>

## How to use tRPC in a Cloudflare Worker

### Install dependencies

```bash
yarn add @trpc/server wrangler@beta zod
```

> [Zod](https://github.com/colinhacks/zod) isn't a required dependency, but it's used in the sample router below.

### Create the router

First of all you need a [router](router) to handle your queries, mutations and subscriptions.

A sample router is given below, save it in a file named `router.ts`.

<details>
  <summary>router.ts</summary>

```ts title='router.ts'
import { initTRPC } from '@trpc/server';
import { z } from 'zod';
import { Context } from './context';

type User = {
  id: string;
  name: string;
  bio?: string;
};

const users: Record<string, User> = {};

export const t = initTRPC.context<Context>().create();

export const appRouter = t.router({
  getUserById: t.procedure.input(z.string()).query(({ input }) => {
    return users[input]; // input type is string
  }),
  createUser: t.procedure
    // validate input with Zod
    .input(
      z.object({
        name: z.string().min(3),
        bio: z.string().max(142).optional(),
      }),
    )
    .mutation(({ input }) => {
      const id = Date.now().toString();
      const user: User = { id, ...input };
      users[user.id] = user;
      return user;
    }),
});

// export type definition of API
export type AppRouter = typeof appRouter;
```

</details>

If your router file starts getting too big, split your router into several subrouters each implemented in its own file. Then [merge them](merging-routers) into a single root `appRouter`.

### Create the context

Then you need a [context](context) that will be created for each request.

A sample context is given below, save it in a file named `context.ts`:

<details>
  <summary>context.ts</summary>

```ts title='context.ts'
import { inferAsyncReturnType } from '@trpc/server';
import { FetchCreateContextFnOptions } from '@trpc/server/adapters/fetch';

export function createContext({ req }: FetchCreateContextFnOptions) {
  const user = { name: req.headers.get('username') ?? 'anonymous' };
  return { req, user };
}

export type Context = inferAsyncReturnType<typeof createContext>;
```

</details>

### Create Cloudflare Worker

tRPC includes an adapter for the [Fetch API](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API) out of the box. This adapter lets you convert your tRPC router into a [`Request`](https://developer.mozilla.org/en-US/docs/Web/API/Request) handler that returns [`Response`](https://developer.mozilla.org/en-US/docs/Web/API/Response) objects.

```ts title='server.ts'
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { appRouter } from './router';
import { createContext } from './context';

export default {
  async fetch(request: Request): Promise<Response> {
    return fetchRequestHandler({
      endpoint: '/trpc',
      req: request,
      router: appRouter,
      createContext,
    });
  },
};
```

Run `wrangler dev server.ts` and your endpoints will be available via HTTP!

| Endpoint     | HTTP URI                                                                                                       |
| ------------ | -------------------------------------------------------------------------------------------------------------- |
| `getUser`    | `GET http://localhost:8787/trpc/getUserById?input=INPUT` <br/><br/>where `INPUT` is a URI-encoded JSON string. |
| `createUser` | `POST http://localhost:8787/trpc/createUser` <br/><br/>with `req.body` of type `User`                          |
