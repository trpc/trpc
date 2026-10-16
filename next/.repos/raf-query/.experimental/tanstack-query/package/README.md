# @raf-query/experimental-tanstack-react-query

> **Experiment. Private, and not published to npm.** It lives under [`.experimental/tanstack-query/`](../) to compare two ways of building raf-query. Its API can change or go away at any time. It stays at version `0.0.0`, and releases skip it.

This package gives you raf-query's render-as-you-fetch API on top of [TanStack Query](https://tanstack.com/query). The published packages, `@raf-query/core` and `@raf-query/react`, run on raf-query's own engine instead. The [root README](../../../README.md) explains the API in full: handles, `use()`, `whilePending`, mutations with Actions. This page covers what is different here.

## What it is

- Queries start in route loaders and server components. Components read them with `useQuery` and React's `use()`.
- `@tanstack/react-query` is its only dependency. There is no Effect.
- The cache is TanStack's own `QueryClient`. TanStack's hooks and devtools work on the same cache, so you can mix them with this API.

To try it, depend on it from inside this workspace:

```json
{
	"dependencies": {
		"@raf-query/experimental-tanstack-react-query": "workspace:*"
	}
}
```

## What it fixes in TanStack Query

Render-as-you-fetch with plain TanStack Query has a few traps. This package removes them:

- **No refetch on mount.** A loader fetches, then the component mounts and fetches again because the data is already stale. Here, reads never refetch on mount. Moving a read to a new key doesn't refetch either.
- **Imperative fetches retry.** TanStack's `client.query()` and `fetchQuery` don't retry unless you ask. Here, `prefetch`, `ensure` and `ensureData` retry like a read: 3 times in the browser, never on the server, unless the factory or client sets `retry`.
- **One verb per job.** `prefetch` returns a handle right away and never throws. `ensure` waits for the data and returns a handle. `ensureData` waits and returns the data.
- **A stable promise for `use()`.** `useQuery` returns the same promise until the data changes. It's already resolved when the cache has data, so `use()` only suspends when there is nothing to show.
- **Keep the old data on purpose.** `whilePending: "previous"` and `isPrevious` replace `placeholderData: keepPreviousData` and `isPlaceholderData`.
- **Error boundaries retry.** A failed first load throws to the nearest error boundary once. Resetting the boundary refetches. You don't need `QueryErrorResetBoundary` or `retryOnMount`.
- **Pending queries stream.** The `/rsc` `HydrationBoundary` sends queries that are still loading as promises, so the browser picks up the server's request instead of starting its own. TanStack's `dehydrate` only sends finished queries by default.
- **Keys must cover the input.** Outside production, two inputs that produce the same key log a warning, because they would read each other's data.
- **Factories hold only query settings.** A factory can set `staleTime`, `gcTime`, `retry`, `retryDelay`, `refetchOnWindowFocus`, `refetchOnReconnect`, `networkMode`, `structuralSharing` and `meta`. Options that depend on where a query is read (`enabled`, `select`, `placeholderData`, `initialData`, `refetchOnMount`, `suspense`, `throwOnError`) aren't accepted.

## How it differs from `@raf-query/react`

|                     | `@raf-query/react`                          | This package                                            |
| ------------------- | ------------------------------------------- | ------------------------------------------------------- |
| Cache               | raf-query's own `QueryClient`               | TanStack's `QueryClient`                                |
| Dependencies        | `@raf-query/core`, `effect`                 | `@tanstack/react-query`                                 |
| Start a query       | `qc.prefetch(factory, input)`               | `prefetch(qc, factory, input)`                          |
| Wait for a handle   | `qc.ensure(factory, input)`                 | `ensure(qc, factory, input)`                            |
| Wait for the data   | `qc.fetch(factory, input)`                  | `ensureData(qc, factory, input)`                        |
| Write and read      | `qc.invalidate`, `qc.setData`, `qc.getData` | `invalidate(qc, …)`, `setData(qc, …)`, `getData(qc, …)` |
| Invalidate a prefix | `qc.invalidate({ queryKey })`               | TanStack's `qc.invalidateQueries({ queryKey })`         |
| Client options      | `new QueryClient({ defaults })`             | TanStack's `new QueryClient({ defaultOptions })`        |
| Effect              | Effect `queryFn`s, `qc.effect`              | None                                                    |
| TanStack Router     | `@raf-query/react/tanstack-router`          | TanStack's `@tanstack/react-router-ssr-query`           |
| Devtools            | `@raf-query/react/devtools`                 | TanStack's devtools                                     |

The verbs are free functions that take the client first, because the client is TanStack's class. `ensureData` plays the part of `qc.fetch`; a function named `fetch` would hide the global one.

`useQuery`, `useWaterfall`, `queryOptions`, `infiniteQueryOptions`, `allKeyed` and handles work as in the [root README](../../../README.md). TanStack's own hooks (its `useQuery`, `useSuspenseQuery`, `useMutation`, …) are not re-exported. Import them from `@tanstack/react-query` if you need them; they share the cache.

## Defining queries

A factory takes zero or one argument and returns `queryOptions(...)` or `infiniteQueryOptions(...)`:

```ts
import {
	infiniteQueryOptions,
	queryOptions,
} from "@raf-query/experimental-tanstack-react-query";

export function issueQuery(input: { id: number }) {
	return queryOptions({
		queryFn: () => getIssue({ data: input.id }),
		queryKey: ["issues", "detail", input.id],
	});
}

export function commentsQuery(input: { issueId: number }) {
	return infiniteQueryOptions<CommentPage, number>({
		getNextPageParam: (lastPage) => lastPage.nextCursor,
		initialPageParam: 0,
		queryFn: (context) =>
			listComments({
				data: { cursor: context.pageParam, issueId: input.issueId },
			}),
		queryKey: ["issues", "comments", input.issueId],
	});
}
```

Keys carry TanStack's data tag, so `qc.getQueryData(issueQuery({ id }).queryKey)` is typed too.

## Starting queries

| Call                                   | Returns                | Waits?          |
| -------------------------------------- | ---------------------- | --------------- |
| `prefetch(qc, factory, input)`         | `QueryHandle`          | No              |
| `await ensure(qc, factory, input)`     | `Promise<QueryHandle>` | On a cache miss |
| `await ensureData(qc, factory, input)` | `Promise<Data>`        | On a cache miss |

Fresh cached data is reused. Stale cached data resolves right away and refetches in the background. For paged factories, `ensure` and `ensureData` take `{ pages: n }` as a fourth argument to load more than the first page.

```tsx
import {
	ensure,
	prefetch,
	useQuery,
} from "@raf-query/experimental-tanstack-react-query";

export const Route = createFileRoute("/issues/$issueId")({
	loader: async (args) => {
		const qc = args.context.queryClient;
		const id = Number(args.params.issueId);
		const comments = prefetch(qc, commentsQuery, { issueId: id });
		const issue = await ensure(qc, issueQuery, { id });
		return { comments, issue };
	},
	component: IssuePage,
});

function IssuePage() {
	const data = Route.useLoaderData();
	const [issuePromise] = useQuery(issueQuery, data.issue);
	const issue = use(issuePromise);
	// …
}
```

## Mutations

Write in a form action, then invalidate. `invalidate` marks one query stale and refetches it if something reads it. It resolves once that refetch is done, so the action stays pending until fresh data is on screen:

```tsx
import {
	invalidate,
	useQueryClient,
} from "@raf-query/experimental-tanstack-react-query";

function EditTitle(props: { issue: Issue }) {
	const qc = useQueryClient();
	const [title, setOptimisticTitle] = useOptimistic(props.issue.title);

	return (
		<form
			action={async (formData) => {
				const next = String(formData.get("title"));
				setOptimisticTitle(next);
				await updateIssueTitle({ id: props.issue.id, title: next });
				await invalidate(qc, issueQuery, { id: props.issue.id });
			}}
		>
			<input defaultValue={title} name="title" />
		</form>
	);
}
```

To invalidate every query under a key prefix, use TanStack's method: `await qc.invalidateQueries({ queryKey: ["issues"] })`. `setData(qc, factory, input, updater)` writes data directly; `getData(qc, factory, input)` reads it.

## TanStack Router and TanStack Start

Use TanStack's own integration. It streams the server cache to the browser, turns `redirect()` thrown in a `queryFn` into a navigation, and wraps the app in `QueryClientProvider`:

```tsx
// src/router.tsx
import { QueryClient } from "@raf-query/experimental-tanstack-react-query";
import { createRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";

export function getRouter() {
	const queryClient = new QueryClient();
	const router = createRouter({
		context: { queryClient },
		// The query cache decides what's fresh; loaders always run and dedupe there.
		defaultPreloadStaleTime: 0,
		routeTree,
	});
	setupRouterSsrQueryIntegration({ queryClient, router });
	return router;
}
```

## Next.js App Router

Two subpath entries:

| Entry                                               | Export              | Use                                                                  |
| --------------------------------------------------- | ------------------- | -------------------------------------------------------------------- |
| `@raf-query/experimental-tanstack-react-query/next` | `QueryProvider`     | Client provider for the root layout                                  |
| `@raf-query/experimental-tanstack-react-query/rsc`  | `HydrationBoundary` | Sends a server component's queries to the browser cache as they load |

```tsx
// app/query-client.ts
import { QueryClient } from "@raf-query/experimental-tanstack-react-query";
import { cache } from "react";

export const getQueryClient = cache(() => new QueryClient());
```

```tsx
// app/layout.tsx
import { QueryProvider } from "@raf-query/experimental-tanstack-react-query/next";

export default function RootLayout(props: { children: React.ReactNode }) {
	return (
		<html lang="en">
			<body>
				<QueryProvider>{props.children}</QueryProvider>
			</body>
		</html>
	);
}
```

```tsx
// app/issues/[issueId]/page.tsx — server component
import {
	ensureData,
	prefetch,
} from "@raf-query/experimental-tanstack-react-query";
import { HydrationBoundary } from "@raf-query/experimental-tanstack-react-query/rsc";

export default async function Page(props: {
	params: Promise<{ issueId: string }>;
}) {
	const id = Number((await props.params).issueId);
	const qc = getQueryClient();
	const comments = prefetch(qc, commentsQuery, { issueId: id });
	const issue = await ensureData(qc, issueQuery, { id });
	const assignee = prefetch(qc, userQuery, { id: issue.assigneeId });

	return (
		<HydrationBoundary client={qc}>
			<IssuePage
				assignee={assignee}
				comments={comments}
				issue={prefetch(qc, issueQuery, { id })}
			/>
		</HydrationBoundary>
	);
}
```

- `QueryProvider` makes a new client for each server render and one client per browser tab. The browser client lives outside React state, so a first render that suspends doesn't lose the cache. Pass `config` for the client's options; it must be serializable.
- `HydrationBoundary` takes the request's client and optional TanStack `DehydrateOptions`. Render one in each server component that starts queries for client components. It skips queries an earlier boundary already sent in the same request.
- Next.js rejects server actions called during server rendering. If a query's `queryFn` is a server action, start it in the server component (as with `assignee` above), not with `useWaterfall`.

## Example apps

Both run the same issue tracker as the main examples, on this package:

| App                      | Run                                                              | URL                     |
| ------------------------ | ---------------------------------------------------------------- | ----------------------- |
| [`../start`](../start)   | `pnpm --filter @examples/experimental-tanstack-query-start dev`  | <http://localhost:3002> |
| [`../nextjs`](../nextjs) | `pnpm --filter @examples/experimental-tanstack-query-nextjs dev` | <http://localhost:3003> |

Compare them with `examples/tanstack-start` and `examples/nextjs`, which run on `@raf-query/react`.
