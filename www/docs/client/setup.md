---
id: setup
title: Set up a tRPC Client
sidebar_label: Setup
slug: /vanilla
---

### 1. Install the tRPC Client library

Use your preferred package manager to install the client library

```sh
# npm
npm install @trpc/client

# Yarn
yarn add @trpc/client

# Pnpm
pnpm add @trpc/client
```

### 2. Import your App Router

Import your `AppRouter` type into the client application. This type holds the shape of your entire API.

```ts title='client.ts'
import type { AppRouter } from '../path/to/server/trpc';
```

:::tip
By using `import type` you ensure that the reference will be stripped at compile-time, meaning you don't inadvertently import server-side code into your client. For more information, [see the Typescript docs](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-8.html#type-only-imports-and-export).
:::


### 3. Initialize the tRPC client

Create a tRPC client with the `createTRPCProxyClient` method, and add a `links` array with a [terminating link](./links/index.md#the-terminating-link) pointing at your API. To learn more about tRPC links, [click here](./links/index.md).

```ts title='client.ts'
import type { AppRouter } from '../path/to/server/trpc';

import { createTRPCProxyClient, httpBatchLink } from '@trpc/client';

const client = createTRPCProxyClient<AppRouter>({
  links: [
    httpBatchLink({
      url: 'http://localhost:3000/trpc',
    }),
  ],
});
```

### 4. Use the tRPC Client

Under the hood this creates a typed [JavaScript proxy](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy) which allows you to interact with your tRPC API in a fully type-safe way:

```ts title='client.ts'
const bilbo = await client.getUser.query('id_bilbo');
// => { id: 'id_bilbo', name: 'Bilbo' };

const frodo = await client.createUser.mutate({ name: 'Frodo' });
// => { id: 'id_frodo', name: 'Frodo' };
```

You're all set!
