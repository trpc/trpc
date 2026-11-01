---
title: "Set up a tRPC Client"
label: "Setup"
description: ""
section: "Client Usage"
parent: "client/vanilla"
order: 43
---

### 1. Install the tRPC Client library

Use your preferred package manager to install the `@trpc/client` library, and also install `@trpc/server` which contains some required types.

```package-install
@trpc/server @trpc/client
```

### 2. Import your App Router

Import your `AppRouter` type into the client application. This type holds the shape of your entire API.

```ts twoslash title="utils/trpc.ts"
// @filename: server/router.ts
// ---cut---
import { initTRPC } from '@trpc/server';
import { z } from "zod";
const t = initTRPC.create();

const appRouter = t.router({
  post: t.router({
    byId: t.procedure
      .input(z.object({ id: z.string() }))
      .query(async ({input}) => {
        return { id: input.id, title: 'Hello' };
      }),
  })
});
export type AppRouter = typeof appRouter;
// @filename: utils/trpc.ts
// ---cut---
import type { AppRouter } from '../server/router';
```

> [!TIP]
> By using `import type` you ensure that the reference will be stripped at compile-time, meaning you don't inadvertently import server-side code into your client. For more information, [see the Typescript docs](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-8.html#type-only-imports-and-export).

### 3. Initialize the tRPC client

Create a tRPC client with the `createTRPCClient` method, and add a `links` array with a [terminating link](../links.md#the-terminating-link) pointing at your API. To learn more about tRPC links, [click here](../links.md).

```ts twoslash title="client.ts"
// @filename: server.ts
import { initTRPC } from '@trpc/server';
const t = initTRPC.create();
export const appRouter = t.router({});
export type AppRouter = typeof appRouter;

// @filename: client.ts
declare function getAuthCookie(): string;
// ---cut---
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from './server';

const client = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: 'http://localhost:3000/trpc',

      // You can pass any HTTP headers you wish here
      async headers() {
        return {
          authorization: getAuthCookie(),
        };
      },
    }),
  ],
});
```

### 4. Use the tRPC Client

Under the hood this creates a typed [JavaScript Proxy](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy) which allows you to interact with your tRPC API in a fully type-safe way:

```ts twoslash title="client.ts"
// @target: esnext
// @filename: server.ts
import { initTRPC } from '@trpc/server';
import { z } from 'zod';
const t = initTRPC.create();
const appRouter = t.router({
  getUser: t.procedure.input(z.string()).query(({ input }) => ({ id: input, name: 'Bilbo' })),
  createUser: t.procedure.input(z.object({ name: z.string() })).mutation(({ input }) => ({ id: 'id_frodo', ...input })),
});
export type AppRouter = typeof appRouter;

// @filename: client.ts
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from './server';
const client = createTRPCClient<AppRouter>({
  links: [httpBatchLink({ url: 'http://localhost:3000/trpc' })],
});
// ---cut---
const bilbo = await client.getUser.query('id_bilbo');
// => { id: 'id_bilbo', name: 'Bilbo' };

const frodo = await client.createUser.mutate({ name: 'Frodo' });
// => { id: 'id_frodo', name: 'Frodo' };
```

You're all set!
