---
title: Durable calls
description: "`experimental_durable()` keeps a call's result, so a client that lost the response gets it instead of running the mutation twice."
section: Middleware
order: 4
experiment: middleware
---

`experimental_durable()` keeps a call's result, so a client that lost the response (a dropped connection, a closed tab) calls again and gets it instead of running the mutation twice. The call runs detached from its request: the client going away doesn't interrupt it.

Results live in Effect's `BackingPersistence`: `Persistence.layerBackingMemory` for one instance, `layerBackingRedis`, `layerBackingSql` or `layerBackingKvs` for many. Put it after `.input()`, so a reused call id with a different input fails with `CONFLICT`:

```ts
import { Persistence } from 'effect/persistence';
import { experimental_durableLink, httpLink } from '@trpc12/trpc/client';
import { experimental_durable } from '@trpc12/trpc/middleware';

const checkout = t.procedure
  .input(Cart)
  .use(experimental_durable({ ttl: '1 hour' }))
  .mutation(/* … */);

createFetchHandler({ router, layer: Persistence.layerBackingMemory });

const client = createTrpcClient({
  router: routerType<AppRouter>(),
  links: [experimental_durableLink(), httpLink({ url, batch: true })],
});
// After a reload, pick up the same call:
await client.checkout.mutate(cart, { callId: sessionStorage.checkoutId });
```

## The link

`experimental_durableLink()` gives every mutation (and queries called with `{ durable: true }`) a `trpc-call-id` header, sends it outside any batch, and retries a lost response with the same id. Successes and typed errors are kept for `ttl` (10 minutes by default); unexpected errors aren't, so a retry runs again.

Two instances sharing a store run a call once: the second waits for the first's result, and runs it itself if the first stops heartbeating its claim (`claimTtl`). The store has no atomic claim, so two instances that start the same call at the same moment can both run it.

## Streamed outputs

Results are stored with danSON (`transformer` to change it), whatever the wire transformer. Streamed outputs (async iterables, `Stream`s, promises at any depth) are kept as the frames the handler sends, written from a fiber that keeps going after the client leaves. When the connection drops mid-stream, `httpLink` calls again with the same id and `trpc-resume-from: <frames it got>`, and the open deferred values settle from the new response, on any instance sharing the store. That works over unbatched HTTP, which `experimental_durableLink()` uses; over other transports streamed outputs aren't kept.

For work a client should follow across sessions, start it in a mutation that returns an id and publish its progress to a [`experimental_Publisher`](../subscriptions/publisher.md) channel the client subscribes to with `lastEventId`.

## Over WebSockets

Over WebSockets there are no per-call headers; key the call from its input with `` key: ({ input, path }) => `${path}:${input.requestId}` ``. The resolver's `signal` still aborts when the client leaves, so don't hand it to work that should finish.

On Durable Objects, [durable calls](../adapters/cloudflare.md#durable-calls) keep results in the object's storage.

The [`examples/experimental/durable-jobs`](../../../examples/experimental/durable-jobs/README.md) app runs two servers on one Redis: a payment whose response is lost is charged once, and a report cut on one server resumes on the other.
