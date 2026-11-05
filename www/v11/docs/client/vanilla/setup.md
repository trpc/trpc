---
id: setup
title: Set up a tRPC Client
sidebar_label: Setup
slug: /client/vanilla/setup
section: "Client Usage"
parent: "client/vanilla"
order: 43
skill:
  name: client-setup
  package: "@trpc/client"
  type: core
  requires:
    - server-setup
  description: Create a vanilla tRPC client with createTRPCClient<AppRouter>()
    and a terminating link such as httpBatchLink, import AppRouter with `import
    type`, set dynamic auth headers, and put the transformer on links (not the
    client constructor). Infer types with inferRouterInputs and
    inferRouterOutputs, handle TRPCClientError with try/catch or safe(), and
    abort calls with an AbortSignal.
  include:
    - client/vanilla/infer-types
    - client/vanilla/error-handling
    - client/vanilla/aborting-procedure-calls
    - client/headers
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

:::tip
By using `import type` you ensure that the reference will be stripped at compile-time, meaning you don't inadvertently import server-side code into your client. For more information, [see the Typescript docs](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-8.html#type-only-imports-and-export).
:::

### 3. Initialize the tRPC client

Create a tRPC client with the `createTRPCClient` method, and add a `links` array with a [terminating link](../links.md#the-terminating-link) pointing at your API. To learn more about tRPC links, [click here](../links.md).

```ts twoslash title='client.ts'
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

```ts twoslash title='client.ts'
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

### 5. Use subscriptions

Given a [subscription procedure](../../server/subscriptions.md) and a link that supports subscriptions, such as [`httpSubscriptionLink`](../links/httpSubscriptionLink.md) or [`wsLink`](../links/wsLink.md), `.subscribe()` starts the subscription. Either pass callbacks, or leave them out and iterate the result with `for await`:

```ts twoslash title='client.ts'
// @target: esnext
// @filename: server.ts
import { initTRPC } from '@trpc/server';
const t = initTRPC.create();
const appRouter = t.router({
  onUserAdd: t.procedure.subscription(async function* () {
    yield { name: 'Frodo' };
  }),
});
export type AppRouter = typeof appRouter;

// @filename: client.ts
import { createTRPCClient, httpSubscriptionLink } from '@trpc/client';
import type { AppRouter } from './server';
const client = createTRPCClient<AppRouter>({
  links: [httpSubscriptionLink({ url: 'http://localhost:3000/trpc' })],
});
// ---cut---
// with callbacks
const sub = client.onUserAdd.subscribe(undefined, {
  onData(user) {
    console.log(user);
  },
});
// stop listening
sub.unsubscribe();

// or with `for await`, without callbacks
const ac = new AbortController();
const users = client.onUserAdd.subscribe(undefined, { signal: ac.signal });
for await (const user of users) {
  //               ^?
  console.log(user);
}
// `ac.abort()` stops it from outside the loop
```

When you iterate a subscription:

- A subscription is either iterated or uses callbacks. Iterating one that was started with callbacks throws, and is a type error.
- Without callbacks, `.subscribe()` returns an async iterator with no `unsubscribe()`, like Node's `events.on()`. Stop it from inside the loop with `break` or `return`, or from outside by aborting the `signal` you passed.
- Data is queued from when `.subscribe()` is called until the loop reads it. The queue has no size limit. A subscription can be iterated once: a second `for await` over it throws. To consume it twice, call `.subscribe()` twice.
- A subscription you never loop over or abort keeps running, so pass a `signal`.
- If you called `unsubscribe()` on a subscription started without callbacks, pass a `signal` and `abort()` it instead.
- Leaving the loop with `break`, `return` or a thrown error unsubscribes and drops the queued data.
- Aborting the `signal` unsubscribes, and the loop yields the data already queued before it ends.
- An error from the subscription is thrown from the loop as a `TRPCClientError`, after the data received before it.

You're all set!

## Common mistakes

- **Leaving out the `AppRouter` type parameter.** `createTRPCClient({ links })` without `<AppRouter>` compiles, but none of your procedures are typed. If the `AppRouter` import doesn't resolve (often a monorepo path or `tsconfig` issue), fix the import rather than reaching for `createTRPCClient<any>`.
- **Importing the router value instead of its type.** `import { appRouter } from '../server/router'` pulls your server code into the client bundle. Export `type AppRouter = typeof appRouter` from the server and import it with `import type`.
- **Passing `transformer` to `createTRPCClient`.** The transformer belongs on each terminating link (`httpBatchLink`, `httpLink`, `wsLink`, ...), and TypeScript rejects it on the client itself. See [Data Transformers](../../server/data-transformers.md).
- **Using `createTRPCProxyClient`.** It's the v10 name, kept as a deprecated alias of `createTRPCClient`.
- **Calling procedures like REST endpoints.** Procedures are addressed by their dot-separated path, for example `GET /trpc/post.byId?input=...`, not `/trpc/post/1`. Call them through the client, or see the [HTTP RPC Specification](../../rpc.md) for the wire format.
- **A JSON parse error like `Unexpected token '<'`.** The request reached something that answered with an HTML page, usually a 404, so the link's `url` doesn't match where your adapter serves tRPC (check the `/trpc` prefix).
