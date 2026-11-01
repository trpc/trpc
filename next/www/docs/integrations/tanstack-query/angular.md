---
title: Angular
description: '`@trpc12/experimental-tanstack-angular-query`: `provideTrpc()` next to `provideTanStackQuery`, `injectTrpc()` in components, and `injectSubscription` with signals.'
section: Integrations
parent: integrations/tanstack-query
order: 6
experiment: tanstack-query-frameworks
---

`@trpc12/experimental-tanstack-angular-query` re-exports [`@trpc12/tanstack-query`](../tanstack-query.md) and adds a provider and injectors for a client and its helpers, and an `injectSubscription` that returns signals. It's for `@tanstack/angular-query-experimental`.

```package-install
@trpc12/trpc effect @trpc12/experimental-tanstack-angular-query @tanstack/angular-query-experimental
```

## Provide the client

`createTrpcContext` takes the type of the function that makes the client (or of the client, or the router), so the helpers get what its links declare. Add `provideTrpc(client)` next to `provideTanStackQuery`:

```ts twoslash
// ---cut-start---
import { bootstrapApplication } from '@angular/platform-browser';
import {
  provideTanStackQuery,
  QueryClient,
} from '@tanstack/angular-query-experimental';
import { createTrpcContext } from '@trpc12/experimental-tanstack-angular-query';
import { createTrpcClient, httpLink, routerType } from '@trpc12/trpc/client';
import type { AppRouter } from './server.ts';
declare class App {}
// ---cut-end---
// trpc.ts
const makeClient = () =>
  createTrpcClient({
    router: routerType<AppRouter>(),
    links: [httpLink({ url: '/trpc' })],
  });
export const { provideTrpc, injectTrpc, injectTrpcClient } =
  createTrpcContext<typeof makeClient>();

// main.ts
bootstrapApplication(App, {
  providers: [
    provideTanStackQuery(new QueryClient()),
    provideTrpc(makeClient()),
  ],
});
```

`injectTrpcClient()` returns the client itself, for calls outside TanStack Query.

## Queries and mutations

Call `injectTrpc()` in an injection context (a field initializer) and pass a function to `injectQuery`, so the options follow signals; a new input is a new key:

```ts twoslash
// ---cut-start---
import { Component, input } from '@angular/core';
import {
  injectMutation,
  injectQuery,
  QueryClient,
} from '@tanstack/angular-query-experimental';
import { inject } from '@angular/core';
import { createTrpcContext } from '@trpc12/experimental-tanstack-angular-query';
import type { AppRouter } from './server.ts';
const injectTrpc = createTrpcContext<AppRouter>().injectTrpc;
// ---cut-end---
@Component({
  selector: 'app-post',
  template: `
    <h1>{{ post.data()?.title }}</h1>
    <button (click)="create.mutate({ title: 'New' })">New post</button>
  `,
})
export class PostComponent {
  trpc = injectTrpc();
  queryClient = inject(QueryClient);
  id = input.required<string>();

  post = injectQuery(() =>
    this.trpc.post.byId.queryOptions({ input: { id: this.id() } }),
  );
  create = injectMutation(() =>
    this.trpc.post.create.mutationOptions({
      onSuccess: () =>
        this.queryClient.invalidateQueries(this.trpc.post.pathFilter()),
    }),
  );
}
```

## Subscriptions

`injectSubscription` subscribes from the first browser render until the injector is destroyed, and not during SSR. It returns signals, `status`, `data` (the latest event) and `error`, with `reset()`. The function is tracked, and a new input restarts the subscription. Outside an injection context, pass `{ injector }`:

```ts twoslash
// ---cut-start---
import { Component, signal } from '@angular/core';
import {
  createTrpcContext,
  injectSubscription,
} from '@trpc12/experimental-tanstack-angular-query';
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
const injectTrpc = createTrpcContext<typeof router>().injectTrpc;
// ---cut-end---
@Component({ selector: 'app-ticker', template: `<p>{{ ticks.data() }}</p>` })
export class TickerComponent {
  trpc = injectTrpc();
  from = signal(10);
  ticks = injectSubscription(() =>
    this.trpc.clock.ticks.subscriptionOptions({ input: { from: this.from() } }),
  );
}
```

What subscriptions share, and the query-cache forms (`liveOptions()`, `streamedOptions()`), are in [Subscriptions](./subscriptions.md).
