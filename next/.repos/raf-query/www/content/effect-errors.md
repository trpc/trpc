---
title: Effect typed errors
description: An Effect queryFn's error type is the query's. useQuery returns a Result so you match failures inline; catchTag in loaders and actions; or throwOnError to an error boundary.
section: Integrations
order: 6
---

An Effect `queryFn`'s error type is the query's error type. It flows through the factory: `ErrorOf<TFactory>` names it, and every verb on the cache fails with it. Catch the failures you expect with [`Effect.catchTag`](https://effect.website/docs/v4/api/effect/Effect#catchTag), and the type tells you what's left.

In React, a client with a `layer` defaults to `throwOnError: false`: `useQuery` gives you a `Result<Data, ErrorOf>` so you match failures inline with Effect's [`Result`](https://effect.website/docs/v4/data-types/result). Promise `queryFn`s keep a rejecting promise — their `ErrorOf` is `unknown`, so a `Result` would not help.

The examples use the issue tracker from [Using Effect](./effect.md#the-whole-picture): an `IssueApi` service whose methods fail with `IssueNotFound`, `Unauthorized` and `EmptyTitle`.

## Inferred from the queryFn

```sample
tanstack-start-effect/src/docs/effect-errors.ts#inferred-from-the-queryfn
```

`ensure` and `fetch` add `Query.CancelledError`, for a request that was cancelled while they waited. `prefetch` never fails: it returns a handle, and readers of the handle see the error.

## In React

With a `layer`, the client defaults to `throwOnError: false`. `useQuery` then returns a thenable of `Result<Data, ErrorOf>` — `use()` suspends while pending and never throws. Match the Result:

```sample
tanstack-start-effect/src/docs/effect-errors.tsx#in-react
```

Set `throwOnError: true` on the query, on the call, or on the client to get a rejecting promise again (and throw to an error boundary). The call's option only exists in the type when `ErrorOf` is typed — promise `queryFn`s always throw. On the same client, a query whose `queryFn` returns a promise still reads as plain data: `useQuery` tells the two apart by what the `queryFn` returned, on this client or on the server whose data was hydrated, so Effect and promise queries mix freely.

### Set it on the query

A query whose failures always belong to an error boundary sets `throwOnError` in its options, so no read has to repeat it. Reads that don't set their own follow it, and so do their types: TypeScript can't see the flag a client was built with, but it sees the factory's. A read's own `throwOnError` still wins:

```ts twoslash
import { Effect, Schema } from "effect";
import { type QueryHandle, queryOptions, useQuery } from "@raf-query/react";
class IssueNotFound extends Schema.TaggedError<IssueNotFound>()(
	"IssueNotFound",
	{ id: Schema.Number },
) {}
declare function getIssue(
	id: number,
): Effect.Effect<{ title: string }, IssueNotFound>;
declare const handle: QueryHandle<typeof issueQuery>;
// ---cut---
function issueQuery(input: { id: number }) {
	return queryOptions({
		queryKey: ["issue", input.id],
		queryFn: () => getIssue(input.id),
		throwOnError: true,
	});
}

const [issuePromise] = useQuery(issueQuery, handle);
//     ^?
const [issueResult] = useQuery(issueQuery, handle, { throwOnError: false });
//     ^?
```

A read takes its flag from the call, else the query, else the client. Set it on the query when every read of it should agree, for example in a factory maker that builds a whole API's queries. If you pass `queryOptions`' type parameters yourself, pass the fifth, `TThrow`, as well (`queryOptions<Data, Error, Services, QueryKey, true>`), or set the flag through inference.

`retry` and `retryDelay` still get the error as `unknown` (query defaults share them). Narrow with the schema there too:

```sample
tanstack-start-effect/src/docs/effect-errors.retry-predicate.ts#retry-predicate
```

## Catch it where you call

Loaders that only `prefetch` or `ensure` use the Promise verbs, the same as a non-Effect app. When the loader itself needs Effect — a typed `catchTag`, or `yield*` of a service — write it as an [`Effect.fn`](https://effect.website/docs/v4/api/effect/Effect#fn-variable) that `yield*`s the `QueryCache` service, and run it with `queryClient.runPromise`. That runs it with the services of the client's [layer](./effect-services.md#services-in-queryclient), as Effect's [`ManagedRuntime`](https://effect.website/docs/v4/api/effect/ManagedRuntime) does. The failures stay typed until the Effect catches them, and the promise rejects with whatever is left.

A loader can turn a typed failure into the router's own error. Here a missing issue becomes TanStack Router's `notFound()`, so the route renders its not-found page, and anything else reaches `errorComponent`:

```sample title="src/routes/issues.$issueId.tsx"
tanstack-start-effect/src/docs/effect-errors.route.tsx#catch-it-where-you-call
```

`catchTag("IssueNotFound", …)` type-checks because `ErrorOf<typeof issueQuery>` includes that tag. Leave a tag out and TypeScript rejects the call.

A form action can catch every failure it declares into the message the form shows. [`Effect.catchTags`](https://effect.website/docs/v4/api/effect/Effect#catchTags) lists them, and the Effect is left with `never` in its error channel, so its promise never rejects:

```sample title="src/components/rename-form.tsx"
tanstack-start-effect/src/docs/effect-errors.tsx#catch-it-where-you-call
```

Leave a tag out of `catchTags` and it stays in the error type: the promise can reject with it, and the action throws it to the nearest error boundary.

## Or let it throw

You don't have to match a `Result`. Set `throwOnError: true` on the query, the call or the client, and a failure the Effect leaves uncaught behaves like a rejected promise:

- The Promise verbs (`queryClient.fetch`, `ensure`, `runPromise`) reject with the failure itself, the `IssueNotFound` instance, not a wrapper around it.
- When a query's first load fails, `use()` throws the failure to the nearest error boundary, and resetting the boundary refetches.
- A failed background refetch keeps the old data on screen and puts the failure in `controls.error`.
- A loader that rejects renders the route's `errorComponent`, and an action that rejects throws to the nearest error boundary.

`controls.error` is also `unknown` — narrow it the same way:

```sample
tanstack-start-effect/src/docs/effect-errors.or-let-it-throw.tsx#or-let-it-throw
```

A query that failed during server rendering rejects in the browser with a `RedactedError`, unless the integration sets `keepErrors` ([SSR and hydration](./ssr-and-hydration.md#errors)), so [`Schema.is`](https://effect.website/docs/v4/api/effect/Schema#is) is false for it. The fallback branch covers it, and resetting the boundary refetches from the browser, where the failure keeps its type.
