---
id: overview
title: tRPC Client
sidebar_label: Overview
slug: /client/vanilla
---

# tRPC Client

The "Vanilla" tRPC client can be used to call your API procedures as if they are local functions, enabling a seamless development experience.

```ts twoslash
// @target: esnext
// @filename: server.ts
import { initTRPC } from '@trpc/server';
import { z } from 'zod';
const t = initTRPC.create();
const appRouter = t.router({
  getUser: t.procedure.input(z.string()).query(({ input }) => ({ id: input, name: 'Bilbo' })),
});
export type AppRouter = typeof appRouter;

// @filename: client.ts
// ---cut---
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from './server';

const client = createTRPCClient<AppRouter>({
  links: [httpBatchLink({ url: 'http://localhost:3000' })],
});

const bilbo = await client.getUser.query('id_bilbo');
// => { id: 'id_bilbo', name: 'Bilbo' };
```

## Subscriptions

The vanilla client also exposes subscription procedures through
`procedure.subscribe()`. Subscriptions need a subscription-capable link, such as
[`httpSubscriptionLink`](../links/httpSubscriptionLink.md) for Server-sent
Events or [`wsLink`](../links/wsLink.md) for WebSockets. Use
[`splitLink`](../links/splitLink.mdx) when the same client should send queries
and mutations over HTTP while routing subscriptions over the subscription link.

```ts twoslash
// @target: esnext
// @filename: server.ts
import { initTRPC } from '@trpc/server';
const t = initTRPC.create();
export const appRouter = t.router({
  onPostAdd: t.procedure.subscription(async function* () {
    yield { id: 'post_1', title: 'Hello tRPC' };
  }),
});
export type AppRouter = typeof appRouter;

// @filename: client.ts
// ---cut---
import {
  createTRPCClient,
  httpBatchLink,
  httpSubscriptionLink,
  splitLink,
} from '@trpc/client';
import type { AppRouter } from './server';

const client = createTRPCClient<AppRouter>({
  links: [
    splitLink({
      condition: (op) => op.type === 'subscription',
      true: httpSubscriptionLink({
        url: 'http://localhost:3000/trpc',
      }),
      false: httpBatchLink({
        url: 'http://localhost:3000/trpc',
      }),
    }),
  ],
});

const subscription = client.onPostAdd.subscribe(undefined, {
  onData(post) {
    // `post` is inferred from the subscription procedure output
    console.log('new post', post.title);
  },
  onError(error) {
    console.error('subscription error', error);
  },
});

// Later, stop receiving events.
subscription.unsubscribe();
```

### When to use the Vanilla Client?

You are likely to use this client in two scenarios:

- With a frontend framework for which we don't have an official integration
- With a separate backend service written in TypeScript.

### When **NOT** to use the Vanilla Client?

- While you _can_ use the client to call procedures from a React component, you should usually use our [TanStack React Query Integration](../tanstack-react-query/setup.mdx). It offers many additional features such as the ability to manage loading and error state, caching, and invalidation.
- We recommend you do not use this client when calling procedures of the same API instance, this is because the invocation has to pass through the network layer. For complete recommendations on invoking a procedure in the current API, you can [read more here](/docs/server/server-side-calls).
