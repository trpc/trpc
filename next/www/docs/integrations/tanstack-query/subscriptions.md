---
title: Subscriptions in TanStack Query
label: Subscriptions
description: "`subscriptionOptions()` for each framework's subscription primitive, shared between components, and `liveOptions()` and `streamedOptions()` in the query cache."
section: Integrations
parent: integrations/tanstack-query
order: 9
v11: client/tanstack-react-query/usage
---

A subscription procedure has three helpers. `subscriptionOptions()` feeds your framework's subscription primitive (`useSubscription`, `createSubscription`, `injectSubscription` or `createSubscriptionController`), outside the query cache. `liveOptions()` and `streamedOptions()` put the subscription in the query cache instead, for `useQuery`.

## Outside the query cache

Each framework's primitive gives `status` (`idle`, `connecting`, `active`, `error`), the latest event as `data`, `error` and `reset()`:

```tsx twoslash
// ---cut-start---
import {
  createTrpcQueryUtils,
  useSubscription,
} from '@trpc12/tanstack-react-query';
import { createTrpcClient, httpLink, routerType } from '@trpc12/trpc/client';
import { tracked } from '@trpc12/trpc/server';
import { z } from 'zod';
import { t, type Post } from './server.ts';
declare function onPost(channel: string, after?: string): AsyncIterable<Post>;
declare function toast(message: string): void;
const router = t.router({
  post: {
    onAdd: t.procedure
      .input(z.object({ channel: z.string() }))
      .subscription(async function* (opts) {
        for await (const post of onPost(opts.input.channel, opts.lastEventId)) {
          yield tracked(post.id, post);
        }
      }),
  },
});
const trpc = createTrpcQueryUtils({
  client: createTrpcClient({
    router: routerType<typeof router>(),
    links: [httpLink({ url: '/trpc' })],
  }),
});
// ---cut-end---
function NewPosts(props: { channel: string }) {
  const sub = useSubscription(
    trpc.post.onAdd.subscriptionOptions({
      input: { channel: props.channel },
      onData: (event) => toast(event.data.title),
    }),
  );
  if (sub.status === 'error') return <button onClick={sub.reset}>Retry</button>;
  return <p>Latest: {sub.data?.data.title}</p>;
}
```

- `idle` means disabled (`enabled: false` or `input: skipToken`), not started yet, or ended by the server; `connecting` means started with no event yet; `error` stays until `reset()` starts it again.
- `onData`, `onError` and `onComplete` always run with the latest options, so changing them doesn't restart the subscription. A new input (a new key) or `enabled` does.
- Components with the same client and key share one subscription. A late one starts from the current state, each component's `onData` runs for every later event, `reset()` restarts it for all of them, and it closes when the last one unmounts. Pass `subscriptionCache: undefined` to give an observer its own.
- Reconnects resume from the last `tracked()` id, as with any client ([Subscriptions](../../subscriptions/overview.md)).

`SubscriptionObserver` from `@trpc12/tanstack-query` is what the primitives are built on, for a framework without a package. Its options' `subscribe` may also return an Effect `Stream`, such as an Effect client's `subscribe()`; the last observer leaving interrupts it.

## In the query cache

`liveOptions()` keeps the latest event as the query's data; `streamedOptions()` keeps every event, built on TanStack's `streamedQuery`, capped by `maxChunks`. The subscription closes when no observer is left, and other components read the same data from the cache:

```ts twoslash
// ---cut-start---
import { useQuery } from '@tanstack/react-query';
import { createTrpcQueryUtils } from '@trpc12/tanstack-query';
import { createTrpcClient, httpLink, routerType } from '@trpc12/trpc/client';
import { z } from 'zod';
import { t } from './server.ts';
declare function ticks(symbol: string): AsyncIterable<number>;
declare function messages(room: string): AsyncIterable<{ text: string }>;
const router = t.router({
  price: {
    onTick: t.procedure
      .input(z.object({ symbol: z.string() }))
      .subscription(async function* (opts) {
        yield* ticks(opts.input.symbol);
      }),
  },
  chat: {
    onMessage: t.procedure
      .input(z.object({ room: z.string() }))
      .subscription(async function* (opts) {
        yield* messages(opts.input.room);
      }),
  },
});
const trpc = createTrpcQueryUtils({
  client: createTrpcClient({
    router: routerType<typeof router>(),
    links: [httpLink({ url: '/trpc' })],
  }),
});
// ---cut-end---
const price = useQuery(
  trpc.price.onTick.liveOptions({ input: { symbol: 'TRPC' } }),
);
const chat = useQuery(
  trpc.chat.onMessage.streamedOptions({
    input: { room: 'general' },
    maxChunks: 100,
  }),
);
chat.data;
//   ^?
```

`maxChunks` keeps only the newest events. `refetchMode` says what a refetch does with the events so far: `'reset'` (the default) clears them, `'append'` keeps them and adds the new ones, and `'replace'` swaps them once the new stream ends.
