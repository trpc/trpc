---
id: fastify
title: Fastify Adapter
sidebar_label: Fastify
slug: /server/adapters/fastify
---

## Example app

The best way to start with the Fastify adapter is to take a look at the example application.

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
          <li>Fastify server with WebSocket</li>
          <li>Simple tRPC client in node</li>
        </ul>
      </td>
      <td>
        <ul>
          <li><a href="https://codesandbox.io/s/github/trpc/trpc/tree/next/examples/fastify-server">CodeSandbox</a></li>
          <li><a href="https://github.com/trpc/trpc/tree/next/examples/fastify-server">Source</a></li>
        </ul>
      </td>
    </tr>
  </tbody>
</table>

## How to use tRPC with Fastify

### Install dependencies

```bash
yarn add @trpc/server fastify zod
```

> [Zod](https://github.com/colinhacks/zod) isn't a required dependency, but it's used in the sample router below.

### Create the router

First of all you need a [router](/docs/server/routers) to handle your queries, mutations and subscriptions.

A sample router is given below, save it in a file named `router.ts`.

<details>
  <summary>router.ts</summary>

```ts title='router.ts'
import { initTRPC } from '@trpc/server';
import { z } from 'zod';

type User = {
  id: string;
  name: string;
  bio?: string;
};

const users: Record<string, User> = {};

export const t = initTRPC.create();

export const appRouter = t.router({
  getUserById: t.procedure.input(z.string()).query((opts) => {
    return users[opts.input]; // input type is string
  }),
  createUser: t.procedure
    .input(
      z.object({
        name: z.string().min(3),
        bio: z.string().max(142).optional(),
      }),
    )
    .mutation((opts) => {
      const id = Date.now().toString();
      const user: User = { id, ...opts.input };
      users[user.id] = user;
      return user;
    }),
});

// export type definition of API
export type AppRouter = typeof appRouter;
```

</details>

If your router file starts getting too big, split your router into several subrouters each implemented in its own file. Then [merge them](/docs/server/merging-routers) into a single root `appRouter`.

### Create the context

Then you need a [context](/docs/server/context) that will be created for each request.

A sample context is given below, save it in a file named `context.ts`:

<details>
  <summary>context.ts</summary>

```ts title='context.ts'
import { CreateFastifyContextOptions } from '@trpc/server/adapters/fastify';

export function createContext({ req, res }: CreateFastifyContextOptions) {
  const user = { name: req.headers.username ?? 'anonymous' };

  return { req, res, user };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
```

</details>

### Create Fastify server

tRPC includes an adapter for [Fastify](https://www.fastify.io/) out of the box. This adapter lets you convert your tRPC router into a [Fastify plugin](https://www.fastify.io/docs/latest/Reference/Plugins/). In order to prevent errors during large batch requests, make sure to set the `maxParamLength` Fastify option to a suitable value, as shown.

:::tip
Due to limitations in Fastify's plugin system and type inference, there might be some issues getting for example `onError` typed correctly. You can add a `satisfies FastifyTRPCPluginOptions<AppRouter>['trpcOptions']` to help TypeScript out and get the correct types.
:::

```ts title='server.ts'
import {
  fastifyTRPCPlugin,
  FastifyTRPCPluginOptions,
} from '@trpc/server/adapters/fastify';
import fastify from 'fastify';
import { createContext } from './context';
import { appRouter, type AppRouter } from './router';

const server = fastify({
  maxParamLength: 5000,
});

server.register(fastifyTRPCPlugin, {
  prefix: '/trpc',
  trpcOptions: {
    router: appRouter,
    createContext,
    onError({ path, error }) {
      // report to error monitoring
      console.error(`Error in tRPC handler on path '${path}':`, error);
    },
  } satisfies FastifyTRPCPluginOptions<AppRouter>['trpcOptions'],
});

(async () => {
  try {
    await server.listen({ port: 3000 });
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
})();
```

Your endpoints are now available via HTTP!

| Endpoint     | HTTP URI                                                                                                       |
| ------------ | -------------------------------------------------------------------------------------------------------------- |
| `getUser`    | `GET http://localhost:3000/trpc/getUserById?input=INPUT` <br/><br/>where `INPUT` is a URI-encoded JSON string. |
| `createUser` | `POST http://localhost:3000/trpc/createUser` <br/><br/>with `req.body` of type `User`                          |

## Enable WebSockets

The Fastify adapter supports [WebSockets](../websockets.md) via the [@fastify/websocket](https://www.npmjs.com/package/@fastify/websocket) plugin. All you have to do in addition to the above steps is install the dependency, add some subscriptions to your router and activate the `useWSS` [option](#fastify-plugin-options) in the plugin. The minimum Fastify version required for `@fastify/websocket` is `3.11.0`.

### Install dependencies

```bash
yarn add @fastify/websocket
```

### Import and register `@fastify/websocket`

```ts
import ws from '@fastify/websocket';

server.register(ws);
```

### Add some subscriptions

Edit the `router.ts` file created in the previous steps and add the following code:

```ts title='router.ts'
import { initTRPC } from '@trpc/server';
import { observable } from '@trpc/server/observable';

const t = initTRPC.create();

export const appRouter = t.router({
  randomNumber: t.procedure.subscription(async function* () {
    while (true) {
      yield { randomNumber: Math.random() };
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }),
});
```

### Activate the `useWSS` option

```ts title='server.ts'
server.register(fastifyTRPCPlugin, {
  useWSS: true,
  // Enable heartbeat messages to keep connection open (disabled by default)
  keepAlive: {
    enabled: true,
    // server ping message interval in milliseconds
    pingMs: 30000,
    // connection is terminated if pong message is not received in this many milliseconds
    pongWaitMs: 5000,
  },
  // ...
});
```

It's alright, you can subscribe to the topic `randomNumber` and you should receive a random number every second 🚀.

## Fastify plugin options

| name        | type                     | optional | default   | description |
| ----------- | ------------------------ | -------- | --------- | ----------- |
| prefix      | `string`                 | `true`   | `"/trpc"` |             |
| useWSS      | `boolean`                | `true`   | `false`   |             |
| trpcOptions | `NodeHTTPHandlerOptions` | `false`  | `n/a`     |             |
