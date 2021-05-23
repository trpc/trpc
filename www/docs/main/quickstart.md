---
id: quickstart
title: Quickstart
sidebar_label: Quickstart
slug: /quickstart
author: colinhacks
author_url: https://twitter.com/colinhacks
author_image_url: https://avatars.githubusercontent.com/u/3084745?v=4
---

## Installation

**⚠️ Requirements**: tRPC requires TypeScript > 4.1 as it relies on [Template Literal Types](https://www.typescriptlang.org/docs/handbook/2/template-literal-types.html).

`npm install @trpc/server`

For implementing tRPC endpoints and routers. Install in your server codebase.

`npm install @trpc/client`

For making typesafe API calls from your client. Install in your client codebase.

`npm install @trpc/react`

For generating a powerful set of React hooks directly from your tRPC client. Powered by [react-query](https://react-query.tanstack.com/).

`npm install @trpc/next`

A set of utilies for integrating tRPC with Next.js

## Defining a router

Let's walk through the steps of building a typesafe API with tRPC. To start, this API will only contain two endpoints:

```ts
getUser(id: string) => { id: string; name: string; }
createUser(data: {name:string}) => { id: string; name: string; }
```

### Create a router instance

First we define a router somewhere in our server codebase:

```ts
// server/index.ts
import * as trpc from '@trpc/server';
export const AppRouter = trpc.router();
```

### Add a query endpoint

Use the `.query()` method to add a endpoint endpoint to the router. Arguments:

`.query(name: string, params: QueryParams)`

- `name: string`: The name of this endpoint
- `params.input`: Optional. This should be a function that validates/casts the _input_ of this endpoint and either returns a strongly typed value (if valid) or throws an error (if invalid). Alternatively you can pass a [Zod](https://github.com/colinhacks/zod) or [Yup](https://github.com/jquense/yup) schema.
- `params.resolve`: This is the actual implementation of the endpoint. It's a function with a single `req` argument. The validated input is passed into `req.input` and the context is in `req.ctx` (more about context later!)

```ts
// server/index.ts
import * as trpc from '@trpc/server';

export const AppRouter = trpc.router().query('getUser', {
  input: (val: unknown) => {
    if (typeof val === 'string') return val;
    throw new Error(`Invalid input: ${typeof val}`);
  },
  async resolve(req) {
    req.input; // string
    return { id: req.input, name: 'Bilbo' };
  },
});
```

### Add a mutation endpoint

Similarly to GraphQL, tRPC makes a distinction between query and mutation endpoints. Let's add a `createUser` mutation:

```ts
createUser(payload: {name: string}) => {id: string; name: string};
```

```ts
// server/index.ts
import * as trpc from '@trpc/server';
import { z } from 'zod';

export const AppRouter = trpc
  .router()
  .query('getUser', {
    input: (val: unknown) => {
      if (typeof val === 'string') return val;
      throw new Error(`Invalid input: ${typeof val}`);
    },
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
```

## Handle incoming requests

Now let's actually handle some API requests! tRPC includes adapters for Next.js and Express.js out of the box, or you can manually integrate your tRPC router with your HTTP server of choice.

### Next.js

The easiest way to use tRPC is with Next.js. Next makes it easy to implement your client and server in the same codebase. tRPC provides an easy way to expose your `appRouter` as a catch-all API route:

```ts
// pages/api/trpc/[trpc].ts
import { createNextApiHandler } from '@trpc/server/adapters/next';

const appRouter = /* */;

export default createNextApiHandler({
  router: appRouter,
  createContext: (opts) => {
    return { bearer: opts.req.headers.authorization };
  },
});
```

Your endpoints are now accessible via HTTP! Assuming you run this Next.js application on `localhost:3000`, here's how your tRPC endpoints map to HTTP:

| Endpoint     | HTTP URI                                                                                             |
| ------------ | ---------------------------------------------------------------------------------------------------- |
| `getUser`    | `GET http://localhost:3000/api/getUser?input=INPUT` <br/>where `INPUT` is a URI-encoded JSON string. |
| `createUser` | `POST http://localhost:3000/api/createUser` <br/>with `req.body` of type `{name: string}`            |

As you can see, _queries_ are exposed via a `GET` endpoint and the input is encoded in the URL as a query param. In contrast, _mutations_ are exposed via `POST` endpoints that expect the input to be including the the request `body`. This lets tRPC takes full example of standard HTTP caching best practices.

### Express.js

If you're using Express, do this instead:

```ts
import { createExpressMiddleware } from '@trpc/server/adapters/express';

const appRouter = /* ... */;

const app = express();

app.use(
  '/trpc',
  createExpressMiddleware({
    router: AppRouter,
    createContext: () => null, // no context
  })
);

app.listen(4000);
```

| Endpoint     | HTTP URI                                                                                         |
| ------------ | ------------------------------------------------------------------------------------------------ |
| `getUser`    | `GET http://localhost:4000/getUser?input=INPUT` <br/>where `INPUT` is a URI-encoded JSON string. |
| `createUser` | `POST http://localhost:4000/createUser` <br/>with `req.body` of type `{name: string}`            |

### The manual approach

You can integrate tRPC into your existing API structure by creating a "caller" with the `.createCaller()`. This method accepts a `ctx` arguement which will be made available as `req.ctx` inside your endpoint resolvers.

```ts
// pass `null` as the context
const caller = appRouter.createCaller(null);

await caller.query('getUser', 'id_123');
// => Promise<{id: 'id_123', name: 'Bilbo'}>
```

A caller is essentially a fully-typed SDK for your API! You can use this "SDK" to implement your API using the HTTP framework of your choice.

## Make API calls

The magic of tRPC is making _strongly typed_ API calls without relying on code generation. With fullstack TypeScript projects, you can directly _import types from the server into the client_! This is a vital part of how tRPC works.

Import the `AppRouter` type into your client. This single type represents the type signature of your entire API!

```ts
// pages/index.tsx
import type { AppRouter } from '../path/to/server/trpc.ts';
```

The `import type` keywords let you import from _any TypeScript file_ on your filesystem. Plus `import type` can only import types, NOT code. So there's no danger of accidentally importing server-side code into your client. All calls to `import type` are _always fully erased_ from your compiled JavaScript bundle ([source](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-8.html#type-only-imports-and-export)).

### Initialize a tRPC client

Create a typesafe client with the `createTRPCClient` method from `@trpc/client`:

```ts
// pages/index.tsx
import type { AppRouter } from '../path/to/server/trpc.ts';
import { createTRPCClient } from '@trpc/client';

const client = createTRPCClient<AppRouter>({
  url: 'http://localhost:5000/trpc',
});
```

As you can see, we passed `AppRouter` as a **type argument** of `createTRPCClient`. This returns a strongly typed `client` instance:

```ts
const bilbo = await client.query('getUser', 'id_bilbo');
// => { id: 'id_bilbo', name: 'Bilbo' };

const frodo = await client.mutation('createUser', { name: 'Frodo' });
// => { id: 'id_frodo', name: 'Frodo' };
```

### Next.js integration

tRPC and Next.js are a match made in heaven! Check out the dedicated [Next.js quickstart](/docs/nextjs-basic) to learn how to structure a Next.js project that uses tRPC.

### React integration

If you use React, you can use the `@trpc/react` package to convert your tRPC client into React hooks powered by [React Query](https://react-query.tanstack.com/). This gets you a ton of cool features like request invalidation, SSR, and cursor-based pagination! 🚀

```ts
import { createReactQueryHooks } from '@trpc/react';
import type { AppRouter } from '../server/trpc';

export const trpc = createReactQueryHooks<AppRouter>();
```

<details>
  <summary>Complete React example</summary>
  <br/>
  Below a complete example of a React component that makes an API call with tRPC and renders the result:
  <br/>
  <br/>

```tsx
import { createTRPCClient } from '@trpc/client';
import { createReactQueryHooks } from '@trpc/react';
import type { AppRouter } from './api/[trpc]';

const client = createTRPCClient<AppRouter>({
  url: 'http://localhost:5000/trpc',
});

const trpc = createReactQueryHooks<AppRouter>();

const IndexPage = () => {
  // const [user, setUser] = useState<{ id: string; name: string } | null>(null);
  // useEffect(() => {
  //   client.query('getUser', 'user_1238823498').then(setUser);
  // }, []);

  const user = trpc.useQuery(['getUser', 'id_bilbo']);

  if (!user.data) return <div>Loading...</div>;

  return (
    <div>
      <p>ID: {user.data.id}</p>
      <p>Name: {user.data.name}</p>
    </div>
  );
};

export default IndexPage;
```

</details>
