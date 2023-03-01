---
id: standalone
title: Standalone Usage
sidebar_label: Standalone
slug: /standalone
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
      <td>Standalone tRPC Server with Node.js</td>
      <td><em>n/a</em></td>
      <td>
        <ul>
          <li><a href="https://githubbox.com/trpc/trpc/blob/main/examples/minimal">CodeSandbox</a></li>
          <li><a href="https://github.com/trpc/trpc/blob/main/examples/minimal/server/index.ts">Source</a></li>
        </ul>
      </td>
    </tr>
  </tbody>
</table>

## Setting up a Standalone tRPC Server

### 1. Implement your App Router

Implement your tRPC router. For example:

```ts title='appRouter.ts'
import { initTRPC } from '@trpc/server';
import { z } from 'zod';

export const t = initTRPC.create();

export const appRouter = t.router({
  getUser: t.procedure.input(z.string()).query((req) => {
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

For more information you can look at the [quickstart guide](/docs/quickstart)

### 2. Use the Standalone adapter

The Standalone adapter runs a simple Node.js HTTP server.

```ts title='server.ts'
import { inferAsyncReturnType, initTRPC } from '@trpc/server';
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import { appRouter } from './appRouter.ts'

createHTTPServer({
  router: appRouter,
  createContext() {
    console.log('context 3');
    return {};
  },
}).listen(2022);
```

## Handling CORS & Options

By default the standalone server will not respond to HTTP OPTIONS requests, or set any CORS headers.

If you're not hosting in an environment which can handle this for you, like during local development, you may need to handle it.

### 1. Install cors

You can add support yourself with the popular `cors` package

```bash
yarn add cors
yarn add -D @types/cors
```

For full information on how to configure this package, [check the docs](https://github.com/expressjs/cors#readme)


### 2. Configure the Standalone server

This example just throws open CORS to any request, which is useful for development, but you can and should configure it more strictly in a production environment.

```ts title='server.ts'
import { inferAsyncReturnType, initTRPC } from '@trpc/server';
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import cors from 'cors';

createHTTPServer({
  middleware: cors(),
  router: appRouter,
  createContext() {
    console.log('context 3');
    return {};
  },
}).listen(3333);
```

The `middleware` option will accept any function which resembles a node.js middleware, so it can be used for more than `cors` handling if you wish. It is, however, intended to be a simple escape hatch and as such won't on its own allow you to compose multiple middlewares together. If you want to do this then you could:

1. Use an alternate adapter with more comprehensive middleware support, like the [Express adapter](/docs/express)
2. Use a solution to compose middlewares such as [connect](https://github.com/senchalabs/connect)
3. Extend the Standalone `createHTTPHandler` with a custom http server (see below)

## Going further

If `createHTTPServer` isn't enough you can also use the standalone adapter's `createHTTPHandler` function to create your own HTTP Server. For instance:

```ts title='server.ts'
import { inferAsyncReturnType, initTRPC } from '@trpc/server';
import { createHTTPHandler } from '@trpc/server/adapters/standalone';
import { createServer } from 'http'

const handler = createHTTPHandler({
  router: appRouter,
  createContext() {
    return {};
  },
});

createServer((req, res) => {
  /**
   * Handle the request however you like, 
   * just call the tRPC handler when you're ready
   */

  handler(req, res)
})

server.listen(3333)
```
