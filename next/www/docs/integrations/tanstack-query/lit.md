---
title: Lit
description: '`@trpc12/experimental-tanstack-lit-query`: a provider element for the client, `useTrpc(this)` in elements, and `createSubscriptionController`.'
section: Integrations
parent: integrations/tanstack-query
order: 7
experiment: tanstack-query-frameworks
---

`@trpc12/experimental-tanstack-lit-query` re-exports [`@trpc12/tanstack-query`](../tanstack-query.md) and adds a provider element and `@lit/context` consumers for a client and its helpers, and a `createSubscriptionController`. Without a provider, `createTrpcQueryUtils({ client })` works in Lit too.

```package-install
@trpc12/trpc effect @trpc12/experimental-tanstack-lit-query @tanstack/lit-query @lit/context
```

## Provide the client

`createTrpcContext` takes the type of the function that makes the client (or of the client, or the router), so the helpers get what its links declare. Its `TrpcProvider` element isn't registered: define it under a tag of your choice, as TanStack's `QueryClientProvider`, and set its `client` as a property, inside TanStack's provider:

```ts twoslash
// ---cut-start---
import { html } from 'lit';
import { QueryClient, QueryClientProvider } from '@tanstack/lit-query';
import { createTrpcContext } from '@trpc12/experimental-tanstack-lit-query';
import { createTrpcClient, httpLink, routerType } from '@trpc12/trpc/client';
import type { AppRouter } from './server.ts';
// ---cut-end---
// trpc.ts
const makeClient = () =>
  createTrpcClient({
    router: routerType<AppRouter>(),
    links: [httpLink({ url: '/trpc' })],
  });
export const { TrpcProvider, useTrpc, useTrpcClient } =
  createTrpcContext<typeof makeClient>();
customElements.define('trpc-provider', TrpcProvider);

// app.ts
customElements.define('query-client-provider', QueryClientProvider);
const queryClient = new QueryClient();
const client = makeClient();
html`<query-client-provider .client=${queryClient}>
  <trpc-provider .client=${client}><post-view></post-view></trpc-provider>
</query-client-provider>`;
```

`context` is the `@lit/context` key too, for `@consume` or a provider of your own.

## Queries and mutations

Call `useTrpc(this)` in a field initializer. It resolves the helpers on first use, so use them once the element is connected: in `render` or in a controller's options function. Pass a function to `createQueryController`, so the options are read again on each update; a new input is a new key:

```ts twoslash
// ---cut-start---
import { html, LitElement } from 'lit';
import {
  createMutationController,
  createQueryController,
} from '@tanstack/lit-query';
import { createTrpcContext } from '@trpc12/experimental-tanstack-lit-query';
import type { AppRouter } from './server.ts';
const useTrpc = createTrpcContext<AppRouter>().useTrpc;
// ---cut-end---
class PostView extends LitElement {
  static override properties = { postId: {} };
  declare postId: string;

  trpc = useTrpc(this);
  post = createQueryController(this, () =>
    this.trpc.post.byId.queryOptions({ input: { id: this.postId } }),
  );
  create = createMutationController(this, () =>
    this.trpc.post.create.mutationOptions(),
  );

  override render() {
    return html`
      <h1>${this.post().data?.title}</h1>
      <button @click=${() => this.create().mutate({ title: 'New' })}>
        New post
      </button>
    `;
  }
}
customElements.define('post-view', PostView);
```

## Subscriptions

`createSubscriptionController` subscribes while the host is connected, and not during SSR. Call it (or read `current`) in `render` for `status`, `data` (the latest event) and `error`; it has `reset()`, and `destroy()` removes it from the host. Pass a function so the options are read again on each update, and a new input restarts the subscription:

```ts twoslash
// ---cut-start---
import { html, LitElement } from 'lit';
import {
  createSubscriptionController,
  createTrpcContext,
} from '@trpc12/experimental-tanstack-lit-query';
import { z } from 'zod';
import { t } from './server.ts';
const router = t.router({
  clock: {
    ticks: t.procedure
      .input(z.object({ from: z.number() }))
      .subscription(async function* (opts) {
        for (let n = opts.input.from; ; n++) yield n;
      }),
  },
});
const useTrpc = createTrpcContext<typeof router>().useTrpc;
// ---cut-end---
class Ticker extends LitElement {
  static override properties = { from: {} };
  declare from: number;

  trpc = useTrpc(this);
  ticks = createSubscriptionController(this, () =>
    this.trpc.clock.ticks.subscriptionOptions({ input: { from: this.from } }),
  );

  override render() {
    return html`<p>${this.ticks().data}</p>`;
  }
}
```

What subscriptions share, and the query-cache forms (`liveOptions()`, `streamedOptions()`), are in [Subscriptions](./subscriptions.md).
