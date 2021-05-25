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

A set of utilies for integrating tRPC with [Next.js](https://nextjs.org/).

### Sample apps

IF you prefer to jump into some complete example projects, check out the examples here:

| URL                                                | Command                   | Path                                                                                                    | Description                                                                                            |
| -------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| [todomvc.trpc.io](https://todomvc.trpc.io)         | `yarn example:todomvc`    | [`./examples/next-prisma-todomvc`](https://github.com/trpc/trpc/tree/main/examples/next-prisma-todomvc) | TodoMVC-example with SSG & Prisma. [Playwright](https://playwright.dev) for E2E-testing                |
| [chat.trpc.io](https://chat.trpc.io)               | `yarn example:chat`       | [`./examples/next-ssg-chat`](https://github.com/trpc/trpc/tree/main/examples/next-ssg-chat)             | Next.js real-time chat example with SSG & Prisma. [Playwright](https://playwright.dev) for E2E-testing |
| [hello-world.trpc.io](https://hello-world.trpc.io) | `yarn example:hello`      | [`./examples/next-hello-world`](https://github.com/trpc/trpc/tree/main/examples/next-hello-world)       | Minimal Next.js example. [Playwright](https://playwright.dev) for E2E-testing                          |
| _n/a_                                              | `yarn example:standalone` | [`./examples/standalone-server`](https://github.com/trpc/trpc/tree/main/examples/standalone-server)     | Standalone tRPC server + node client                                                                   |
| _n/a_                                              | `yarn example:playground` | [`./examples/playground`](https://github.com/trpc/trpc/tree/main/examples/playground)                   | Express server + node client                                                                           |

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

## Next steps

tRPC includes more sophisticated client-side tooling designed for React projects generally and Next.js specifically. Read the appropriate guide next:

- [Usage with Next.js](/docs/nextjs)
- [Usage with Express.js (server-side)](/docs/express)
- [Usage with React (client-side)](/docs/react)
