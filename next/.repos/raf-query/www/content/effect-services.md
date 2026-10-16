---
title: Effect services
description: Effect queryFns can require services. They become part of the factory's type, and QueryClient provides them from a layer.
section: Integrations
order: 5
---

A `queryFn`'s Effect can require [services](https://effect.website/docs/v4/requirements-management/services). They're part of the factory's type, `ServicesOf<TFactory>`, and every verb that can start the query requires them:

```sample
tanstack-start-effect/src/docs/effect-services.ts#intro
```

## Which services a request runs with

- On `QueryCache`, `ensure`, `fetch`, `prefetch`, `getQuery` and `watch` require the factory's services, and so does `Query.fetch`.
- A request runs with the services the cache was built with, under those of the latest of these calls for its entry.
- Requests that start without a caller (a render's read, `refetch`, polling, focus and reconnect, `invalidate`) reuse the entry's last services.
- The caller's [`Scope`](https://effect.website/docs/v4/resource-management/scope) isn't passed on: a request outlives the call that started it. Scope a `queryFn`'s resources with [`Effect.scoped`](https://effect.website/docs/v4/api/effect/Effect#scoped).

## Tracing

Each request runs in a `raf-query.request` [span](https://effect.website/docs/v4/observability/tracing) with a `raf_query.hash` attribute, under the latest caller's span if it had one. Defects are logged with [`Effect.logError`](https://effect.website/docs/v4/api/effect/Effect#logError); typed failures are the query's error.

## Services in QueryClient

`QueryClient` gets its services from a [`layer`](https://effect.website/docs/v4/requirements-management/layers). It's built into the client's scope along with the cache, so it must build synchronously:

```sample
tanstack-start-effect/src/docs/effect-services.services-in-queryclient.ts#services-in-queryclient
```

The client's type is `QueryClient<TServices>`, and its verbs accept only factories whose services the layer provides. Any other factory is a type error. `dispose()` interrupts every request and runs the layer's finalizers.

`queryClient.runPromise(effect)` runs an app's own Effect (a loader, a form action) with the cache and the layer's services, so it can `yield*` both:

```sample
tanstack-start-effect/src/docs/effect-services.run-promise.ts#run-promise
```

Like [`Effect.runPromise`](https://effect.website/docs/v4/api/effect/Effect#runPromise), it rejects with the Effect's failure or defect. An Effect that needs a service the layer doesn't provide is a type error. [Typed errors](./effect-errors.md) covers catching the failures first.

### In React

`QueryClientProvider` takes a client with any services. A hook can't know which ones, so `useQueryClient()` returns a `QueryClient<unknown>`, whose verbs accept any factory and any Effect. A request then fails with a defect if the client's layer lacks a service it needs.

Components rarely need the services anyway. `useQuery` reads what a loader started, and the cache runs every request with the layer's services: the loader's, a render's, a refetch, an invalidation. So keep the check where Effects start: type the router context with the client's services, and loaders and actions get the typed client from it.

```sample
tanstack-start-effect/src/routes/__root.tsx
```

Loaders start queries through the typed client, so a factory that needs a service the layer doesn't provide is a type error there. Components read the handles with `useQuery`, which needs no services:

```sample
tanstack-start-effect/src/routes/issues.$issueId.tsx#services
```

A component that starts an Effect itself, like a form action, gets the client from the route's context too, so `runPromise` keeps the check:

```sample title="src/components/rename-form.tsx"
tanstack-start-effect/src/docs/effect-services.tsx#in-react
```

[Using Effect](./effect.md#the-whole-picture) has the whole app: service, queries, client, loader, components and action.
