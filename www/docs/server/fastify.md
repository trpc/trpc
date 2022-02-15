---
id: fastify
title: Usage with Fastify
sidebar_label: 'Adapter: Fastify'
slug: /fastify
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
          <li>Fastify server with WebSocket</li>
          <li>Simple TRPC client in node</li>
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

## From scratch

### Create the context and router

First you need to create the [context](context) and [router](router) for your application.

```ts
import { createContext } from './createContext';
import { appRouter } from './router';
```

### Create Fastify server

```ts
import fastify from 'fastify';
import fp from 'fastify-plugin';
import { fastifyTRPCPlugin } from '@trpc/server/adapters/fastify';
import { createContext } from './createContext';
import { appRouter } from './router';

const server = fastify();

server.register(fp(fastifyTRPCPlugin), {
  prefix: '/trpc',
  trpcOptions: { router: appRouter, createContext },
});

(async () => {
  try {
    await server.listen(3000);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
})();
```

### Add WebSocket support

```ts
import ws from 'fastify-websocket';

server.register(ws);
server.register(fp(fastifyTRPCPlugin), {
  useWSS: true, // Turn on useWSS flag
  ...
});
```

## Plugin options

| name        | type                     | optional | default   | description |
| ----------- | ------------------------ | -------- | --------- | ----------- |
| prefix      | `string`                 | `true`   | `"/trpc"` |             |
| useWSS      | `boolean`                | `true`   | `false`   |             |
| trpcOptions | `NodeHTTPHandlerOptions` | `false`  | `n/a`     |             |
