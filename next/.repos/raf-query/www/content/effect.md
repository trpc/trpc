---
title: Using Effect
description: The cache is written in Effect. Return Effects from queryFns for typed errors, services and interruption, run loaders and actions as Effects, and read the same queries from React.
section: Integrations
order: 4
---

raf-query's cache is written in [Effect](https://effect.website). Using raf-query doesn't take any Effect: `queryFn`s return promises, and `QueryClient`, the hooks and the integrations speak promises. Apps that do use Effect get the same cache as Effects, with typed errors and [services](./effect-services.md).

`effect` (`^4.0.0`) is a peer dependency of both packages, so an app that uses Effect shares one copy with raf-query.

## The whole picture

An issue page on TanStack Start, from the API to the form that renames the issue. The [Effect example app](./examples.md) is the same thing, in full, with [Effect RPC](https://effect.website/docs/v4/api/effect/rpc/RpcGroup).

### The API: errors and a service

Failures are tagged errors, and the API is a service. Its methods say how they can fail:

```sample
tanstack-start-effect/src/issues.ts#api
```

`IssueApiLive`, a [`Layer<IssueApi>`](https://effect.website/docs/v4/requirements-management/layers), implements it: an HTTP client, an RPC client, a database.

### Queries

A `queryFn` returns an Effect that uses the service. The factory's type carries the service and the errors — `ErrorOf` and `ServicesOf` name them, and every cache verb fails or requires them:

```sample
tanstack-start-effect/src/queries.ts
```

### The client

The `QueryClient`'s `layer` provides the services, and the router context carries the client with their type, so loaders can only start queries the layer can run:

```sample
tanstack-start-effect/src/router.tsx
```

```sample
tanstack-start-effect/src/routes/__root.tsx
```

### The route

Loaders use the same Promise verbs as a non-Effect app. Prefetch is sync; `ensure` returns a Promise. A loader that needs a typed catch is an [`Effect.fn`](https://effect.website/docs/v4/api/effect/Effect#fn-variable), like a form action: it `yield*`s the `QueryCache` service, starts its reads together with [`Effect.all`](https://effect.website/docs/v4/api/effect/Effect#all), and catches what it expects. `runPromise` runs it with the layer's services — the same shape as Effect's [`ManagedRuntime`](https://effect.website/docs/v4/api/effect/ManagedRuntime):

```sample
tanstack-start-effect/src/routes/issues.$issueId.tsx
```

With a `layer`, the client defaults to `throwOnError: false`: Effect `useQuery` returns a [`Result`](https://effect.website/docs/v4/data-types/result) so you can match failures inline ([Typed errors](./effect-errors.md#in-react)). Pass `throwOnError: true` on the call, or set it in the query's options, when you want a rejecting promise instead.

A list page that only prefetches never needs `runPromise`:

```ts
loader: (args) => {
	const qc = args.context.queryClient;
	return {
		counts: qc.prefetch(issueCountsQuery),
		issues: qc.prefetch(issueListQuery, args.deps),
	};
},
```

What the loader doesn't catch, like `Unauthorized`, rejects into `errorComponent`. The components never see the services: the cache runs each `queryFn` with the layer's, whoever starts it.

### A form action

The action is an `Effect.fn` that renames and then waits for the refetched issue. It catches every failure `rename` declares into a message, so the Effect can't fail, and the form shows the message:

```sample
tanstack-start-effect/src/components/rename-form.tsx
```

The client comes from the router context, not `useQueryClient()`: that one is a `QueryClient<unknown>`, so it can't check the action's services ([Services](./effect-services.md#in-react)). [Typed errors](./effect-errors.md) covers where else to catch failures, and what React sees when you don't.

## Effect queryFns

What an Effect `queryFn` adds over a promise:

- **Typed errors.** The Effect's error type is the query's: `qc.effect.fetch(issueQuery, input)` fails with `IssueNotFound | Unauthorized | Query.CancelledError`. `ErrorOf<TFactory>` names it; it's `unknown` for promises. See [Typed errors](./effect-errors.md).
- **Services.** What the Effect requires, `ServicesOf<TFactory>`, every verb that can start the query requires. See [Services](./effect-services.md).
- **Defects aren't retried.** A `queryFn` that throws instead of returning, or an Effect that dies, is a defect: it fails the request without retrying.
- **Interruption.** Cancelling the request interrupts the fiber, so its finalizers run. No `AbortSignal` needed.
- **Schedules.** `retry` accepts a [`Schedule`](https://effect.website/docs/v4/scheduling/using-schedules) as well as a count or predicate:

```sample
tanstack-start-effect/src/docs/effect.ts#effect-queryfns
```

## The cache as an Effect service

`QueryClient` is a Promise wrapper around a `QueryCache` service. `queryClient.runPromise` hands it to loaders and actions, as above, and `qc.effect` is the same service as a value. Effect code outside React builds its own with `QueryCache.make(config)` (scoped: closing the scope interrupts every request and timer) or `QueryCache.layer(config)`:

```sample
tanstack-start-effect/src/docs/effect.the-cache-as-an-effect-service.ts#the-cache-as-an-effect-service
```

The cache has every verb as an Effect: `prefetch`, `ensure`, `fetch`, `invalidate`, `reset`, `remove`, `setData`, `getData` (an [`Option`](https://effect.website/docs/v4/data-types/option)), `isFetching` (a count), `dehydrate` and `hydrate`. `watch` is a [`Stream`](https://effect.website/docs/v4/api/effect/Stream) of an entry's state, and `events` a `Stream` of cache events.

`watch` counts as a reader while it runs, so invalidation and window focus refetch the entry. Outside React, `cache.mount` (`Effect<void, never, Scope>`) refetches read, stale entries on window focus and reconnect while its scope is open.

## Entries and observers

Entries are a data type with module functions, like Effect's own modules:

```sample
tanstack-start-effect/src/docs/effect.entries-and-observers.ts#entries-and-observers
```

`Query.changes(query)` streams the entry's state, and `Query.subscribeUnsafe(query, listener)` is the synchronous version.

`QueryObserver` is one reader's view of a query, as `useQuery` sees it: the controls and the promise, with `whilePending`, `refetchInterval` and the focus and reconnect options. `QueryObserver.make(query, options)` creates one, and `QueryObserver.changes(observer)` streams its results. While it runs, the query counts as read and polls on `refetchInterval`. It's the building block for bindings to other frameworks.

## SSR streaming

The SSR integrations are thin wrappers over Effect APIs:

- `dehydrateStream(options)` (scoped) returns the cache's `initial` state and a `Stream` of `updates`: entries that start or settle later, each sent once, batched per microtask. The stream ends when the scope closes.
- `hydrateStream(stream)` hydrates each state as it arrives.
- [`Stream.toReadableStream`](https://effect.website/docs/v4/api/effect/Stream#toReadableStream) and [`Stream.fromReadableStream`](https://effect.website/docs/v4/api/effect/Stream#fromReadableStream) carry it over a web stream.

The `sent` option (a `Set` of hashes) makes separate `dehydrate` calls of one request skip entries already sent.

## Time and the page

Time comes from Effect's [`Clock`](https://effect.website/docs/v4/api/effect/Clock), and the page from the `Platform` service (focus, visibility, [`navigator.onLine`](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/onLine); the default reads the globals). Provide [`TestClock`](https://effect.website/docs/v4/api/effect/testing/TestClock) or another `Platform` to test staleness, garbage collection and offline retries without a browser. See [Testing](./testing.md).
