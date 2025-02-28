---
id: standalone
title: Standalone Adapter
sidebar_label: Standalone
slug: /server/adapters/standalone
---

tRPC's Standalone Adapter is the simplest way to get a new project working. It's ideal for local development, and for server-based production environments. In essence it's just a wrapper around the standard [Node.js HTTP Server](https://nodejs.org/api/http.html) with the normal options related to tRPC.

If you have an existing API deployment like [Express](express), [Fastify](fastify), or [Next.js](nextjs), which you want to integrate tRPC into, you should have a look at their respective adapters. Likewise if you have a preference to host on serverless or edge compute, we have adapters like [AWS Lambda](aws-lambda) and [Fetch](fetch) which may fit your needs.

It's also not uncommon, where the deployed adapter is hard to run on local machines, to have 2 entry-points in your application. You could use the Standalone Adapter for local development, and a different adapter when deployed.

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
      <td>Standalone tRPC Server</td>
      <td>
        <ul>
          <li><a href="https://stackblitz.com/github/trpc/trpc/tree/next/examples/minimal">StackBlitz</a></li>
          <li><a href="https://github.com/trpc/trpc/blob/main/examples/minimal/server/index.ts">Source</a></li>
        </ul>
      </td>
    </tr>
    <tr>
      <td>Standalone tRPC Server with CORS handling</td>
      <td>
        <ul>
          <li><a href="https://stackblitz.com/github/trpc/trpc/tree/next/examples/minimal-react">StackBlitz</a></li>
          <li><a href="https://github.com/trpc/trpc/blob/main/examples/minimal-react/server/index.ts">Source</a></li>
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
  getUser: t.procedure.input(z.string()).query((opts) => {
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

For more information you can look at the [quickstart guide](/docs/quickstart)

### 2. Use the Standalone adapter

The Standalone adapter runs a simple Node.js HTTP server.

```ts title='server.ts'
import { initTRPC } from '@trpc/server';
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import { appRouter } from './appRouter.ts';

createHTTPServer({
  router: appRouter,
  createContext() {
    console.log('context 3');
    return {};
  },
  // basePath: '/trpc/', // optional, defaults to '/'
}).listen(2022);
```

## Handling CORS & OPTIONS

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
import { initTRPC } from '@trpc/server';
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

The `middleware` option will accept any function which resembles a connect/node.js middleware, so it can be used for more than `cors` handling if you wish. It is, however, intended to be a simple escape hatch and as such won't on its own allow you to compose multiple middlewares together. If you want to do this then you could:

1. Use an alternate adapter with more comprehensive middleware support, like the [Express adapter](/docs/server/adapters/express)
2. Use a solution to compose middlewares such as [connect](https://github.com/senchalabs/connect)
3. Extend the Standalone `createHTTPHandler` with a custom http server (see below)

## Adding a handler to an Custom HTTP server

`createHTTPServer` is returning an instance of Node's built-in `http.Server`(https://nodejs.org/api/http.html#class-httpserver), which means that you have an access to all it's properties and APIs. However, if `createHTTPServer` isn't enough for your usecase, you can also use the standalone adapter's `createHTTPHandler` function to create your own HTTP server. For instance:

```ts title='server.ts'
import { createServer } from 'http';
import { initTRPC } from '@trpc/server';
import { createHTTPHandler } from '@trpc/server/adapters/standalone';

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

  handler(req, res);
}).listen(3001);
```

## Custom base path to handle requests under {#custom-basePath}

The Standalone adapter also supports a `basePath` option, which will slice the basePath from the beginning of the request path.

```ts title='server.ts'
import { createServer } from 'http';
import { initTRPC } from '@trpc/server';
import { createHTTPHandler } from '@trpc/server/adapters/standalone';

const handler = createHTTPHandler({
  router: appRouter,
  basePath: '/trpc/',
});

createServer((req, res) => {
  if (req.url?.startsWith('/trpc/')) {
    return handler(req, res);
  }
  // [... insert your custom logic here ...]

  res.statusCode = 404;
  res.end('Not Found');
}).listen(3001);
```

## HTTP2

The Standalone adapter also supports HTTP/2.

```ts title='server.ts'
import http2 from 'http2';
import { createHTTP2Handler } from '@trpc/server/adapters/standalone';
import { appRouter } from './_app.ts';
import { createContext } from './context.ts';

const handler = createHTTP2Handler({
  router: appRouter,
  createContext,
  // basePath: '/trpc/', // optional, defaults to '/'
});

const server = http2.createSecureServer(
  {
    key: '...',
    cert: '...',
  },
  (req, res) => {
    /**
     * Handle the request however you like,
     * just call the tRPC handler when you're ready
     */
    handler(req, res);
  },
);

server.listen(3001);
```

```ts twoslash title='context.ts'
import { CreateHTTP2ContextOptions } from '@trpc/server/adapters/standalone';

export async function createContext(opts: CreateHTTP2ContextOptions) {
  opts.req;
  //    ^?
  opts.res;
  //    ^?

  opts.info;
  //    ^?
  return {};
}

export type Context = Awaited<ReturnType<typeof createContext>>;
```
