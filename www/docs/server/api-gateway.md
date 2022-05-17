---
id: api-gateway
title: Usage with Amazon API Gateway
sidebar_label: 'Adapter: API Gateway'
slug: /api-gateway
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
      <td>API Gateway with NodeJS client.</td>
      <td><em>n/a</em></td>
      <td>
        <ul>
          <li><a href="https://github.com/trpc/trpc/tree/main/examples/lambda-api-gateway">Source</a></li>
        </ul>
      </td>
    </tr>
  </tbody>
</table>

## How to add tRPC

### 1. Install deps

```bash
yarn add @trpc/server

```

### 2. Create a tRPC router

Implement your tRPC router. A sample router is given below:

```ts title='server.ts'
import * as trpc from '@trpc/server';
import { z } from 'zod';

const appRouter = trpc.router().query('getUser', {
  input: z.string(),
  async resolve(req) {
    req.input; // string
    return { id: req.input, name: 'Bilbo' };
  },
});

// export type definition of API
export type AppRouter = typeof appRouter;
```

### 3. Use the Amazon API Gateway adapter

tRPC includes an adapter for API Gateway out of the box. This adapter lets you run your routes through the API Gateway handler.

```ts title='server.ts'
import * as trpcAPIGW from '@trpc/server/adapters/api-gateway';

const appRouter = /* ... */;

const app = express();

// created for each request
const createContext = ({
  event,
  context,
}: trpcAPIGW.CreateLambdaContextOptions) => ({}) // no context
type Context = trpc.inferAsyncReturnType<typeof createContext>;

app.use(
  '/trpc',
  trpcExpress.createApiGatewayHandler({
    router: appRouter,
    createContext,
  })
);

app.listen(4000);
```

Your endpoints are now available via HTTP!

| Endpoint  | HTTP URI                                                                                                   |
| --------- | ---------------------------------------------------------------------------------------------------------- |
| `getUser` | `GET http://localhost:4000/trpc/getUser?input=INPUT` <br/><br/>where `INPUT` is a URI-encoded JSON string. |
