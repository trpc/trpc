---
id: fastify
title: Fastify Adapter
sidebar_label: Fastify
slug: /server/adapters/fastify
section: "Backend Usage"
parent: "server/adapters"
order: 15
skill:
  name: adapter-fastify
  package: "@trpc/server"
  type: core
  requires:
    - server-setup
  description: Mount tRPC as a Fastify plugin with fastifyTRPCPlugin from
    @trpc/server/adapters/fastify. Configure prefix, trpcOptions (router,
    createContext, onError). Enable WebSocket subscriptions with useWSS and
    @fastify/websocket. Set routerOptions.maxParamLength for batch requests.
    Requires Fastify v5+. FastifyTRPCPluginOptions for type-safe onError.
    CreateFastifyContextOptions provides req, res. Register @fastify/websocket
    before the tRPC plugin.
  include:
    - server/adapters#common-options
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
          <li><a href="https://codesandbox.io/s/github/trpc/trpc/tree/main/examples/fastify-server">CodeSandbox</a></li>
          <li><a href="https://github.com/trpc/trpc/tree/main/examples/fastify-server">Source</a></li>
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

> ⚠️ **Fastify version requirement**
>
> The tRPC v11 Fastify adapter requires **Fastify v5+**.
> Using Fastify v4 may cause requests to return empty responses without errors.

> [Zod](https://github.com/colinhacks/zod) isn't a required dependency, but it's used in the sample router below.

### Create the router

First of all you need a [router](/docs/server/routers) to handle your queries, mutations and subscriptions.

A sample router is given below, save it in a file named `router.ts`.

<details>
  <summary>router.ts</summary>

```ts twoslash title='router.ts'
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

```ts twoslash title='context.ts'
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

```ts twoslash title='server.ts'
// @types: node
// @filename: router.ts
import { initTRPC } from '@trpc/server';
const t = initTRPC.create();
export const appRouter = t.router({});
export type AppRouter = typeof appRouter;

// @filename: context.ts
import { CreateFastifyContextOptions } from '@trpc/server/adapters/fastify';
export function createContext({ req, res }: CreateFastifyContextOptions) {
  const user = { name: req.headers.username ?? 'anonymous' };
  return { req, res, user };
}

// @filename: server.ts
// ---cut---
import {
  fastifyTRPCPlugin,
  FastifyTRPCPluginOptions,
} from '@trpc/server/adapters/fastify';
import fastify from 'fastify';
import { createContext } from './context';
import { appRouter, type AppRouter } from './router';

const server = fastify({
  routerOptions: {
    maxParamLength: 5000,
  },
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

| Endpoint      | HTTP URI                                                                                                       |
| ------------- | -------------------------------------------------------------------------------------------------------------- |
| `getUserById` | `GET http://localhost:3000/trpc/getUserById?input=INPUT` <br/><br/>where `INPUT` is a URI-encoded JSON string. |
| `createUser`  | `POST http://localhost:3000/trpc/createUser` <br/><br/>with `req.body` of type `User`                          |

## Enable WebSockets

The Fastify adapter supports [WebSockets](../websockets.md) via the [@fastify/websocket](https://www.npmjs.com/package/@fastify/websocket) plugin. All you have to do in addition to the above steps is install the dependency, add some subscriptions to your router, and activate the `useWSS` [option](#fastify-plugin-options) in the plugin. The minimum `@fastify/websocket` version required is `3.11.0`.

### Install dependencies

```bash
yarn add @fastify/websocket
```

### Import and register `@fastify/websocket`

```ts twoslash
// @filename: node_modules/@fastify/websocket/index.d.ts
declare const plugin: any;
export default plugin;

// @filename: server.ts
import fastify from 'fastify';
declare const server: ReturnType<typeof fastify>;
// ---cut---
import ws from '@fastify/websocket';

server.register(ws);
```

### Add some subscriptions

Edit the `router.ts` file created in the previous steps and add the following code:

```ts twoslash title='router.ts'
import { initTRPC } from '@trpc/server';

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

```ts twoslash title='server.ts'
// @filename: router.ts
import { initTRPC } from '@trpc/server';
const t = initTRPC.create();
export const appRouter = t.router({});
export type AppRouter = typeof appRouter;

// @filename: context.ts
import { CreateFastifyContextOptions } from '@trpc/server/adapters/fastify';
export function createContext({ req, res }: CreateFastifyContextOptions) {
  return { req, res };
}

// @filename: server.ts
// ---cut---
import {
  fastifyTRPCPlugin,
  FastifyTRPCPluginOptions,
} from '@trpc/server/adapters/fastify';
import fastify from 'fastify';
import { createContext } from './context';
import { appRouter, type AppRouter } from './router';

const server = fastify();

server.register(fastifyTRPCPlugin, {
  useWSS: true,
  trpcOptions: {
    router: appRouter,
    createContext,
    // Enable heartbeat messages to keep connection open (disabled by default)
    keepAlive: {
      enabled: true,
      // server ping message interval in milliseconds
      pingMs: 30000,
      // connection is terminated if pong message is not received in this many milliseconds
      pongWaitMs: 5000,
    },
  },
});
```

You can now subscribe to the `randomNumber` topic and should receive a random number every second 🚀.

## Fastify plugin options

| name        | type                                               | optional | default   | description                                                    |
| ----------- | -------------------------------------------------- | -------- | --------- | -------------------------------------------------------------- |
| prefix      | `string`                                           | `true`   | `"/trpc"` | URL prefix for tRPC routes                                     |
| useWSS      | `boolean`                                          | `true`   | `false`   | Enable WebSocket support via `@fastify/websocket`              |
| trpcOptions | `FastifyHandlerOptions<AppRouter, Request, Reply>` | `false`  | `n/a`     | tRPC handler options including `router`, `createContext`, etc. |

`trpcOptions` accepts the [options every adapter takes](../adapters.md#common-options), like `onError` and `maxBatchSize`. With `useWSS`, it also accepts the WebSocket options `keepAlive`, `dangerouslyDisablePong` and `experimental_encoder`.

## Common mistakes

- **Registering `@fastify/websocket` after the tRPC plugin.** It only adds WebSocket support to routes registered after it, so register it first.
- **Leaving `maxParamLength` at Fastify's default of `100`.** A batch request puts every procedure in one path parameter, like `/trpc/getUserById,createUser`, and Fastify answers `414 URI Too Long` once that gets longer than `maxParamLength`.
- **Using Fastify v4.** The tRPC v11 adapter requires Fastify v5 or later.
