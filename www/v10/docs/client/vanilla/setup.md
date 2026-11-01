---
id: setup
title: Set up a tRPC Client
sidebar_label: Setup
slug: /client/vanilla/setup
section: "Client Usage"
parent: "client/vanilla"
order: 47
---

### 1. Install the tRPC Client library

Use your preferred package manager to install the `@trpc/client` library, and also install `@trpc/server` which contains some required types.

<div class="code-tabs" data-tabs="package-manager">
<div data-tab="npm" data-active>

```bash
npm install @trpc/client @trpc/server
```

</div>
<div data-tab="yarn">

```bash
yarn add @trpc/client @trpc/server
```

</div>
<div data-tab="pnpm">

```bash
pnpm add @trpc/client @trpc/server
```

</div>
<div data-tab="bun">

```bash
bun add @trpc/client @trpc/server
```

</div>
</div>

### 2. Import your App Router

Import your `AppRouter` type into the client application. This type holds the shape of your entire API.

```ts twoslash
// @filename: server/router.ts
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

:::tip
By using `import type` you ensure that the reference will be stripped at compile-time, meaning you don't inadvertently import server-side code into your client. For more information, [see the Typescript docs](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-8.html#type-only-imports-and-export).
:::

### 3. Initialize the tRPC client

Create a tRPC client with the `createTRPCProxyClient` method, and add a `links` array with a [terminating link](../links.md#the-terminating-link) pointing at your API. To learn more about tRPC links, [click here](../links.md).

```ts title='client.ts'
import { createTRPCProxyClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from '../path/to/server/trpc';

const client = createTRPCProxyClient<AppRouter>({
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

```ts title='client.ts'
const bilbo = await client.getUser.query('id_bilbo');
// => { id: 'id_bilbo', name: 'Bilbo' };

const frodo = await client.createUser.mutate({ name: 'Frodo' });
// => { id: 'id_frodo', name: 'Frodo' };
```

You're all set!
