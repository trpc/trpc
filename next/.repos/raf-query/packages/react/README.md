# @raf-query/react

Render-as-you-fetch data fetching for React: start queries in route loaders and server components, pass serializable handles to components, and read them with `use()` under Suspense.

**[Documentation](https://raf-query.katt.dev)** · [Quick start](https://raf-query.katt.dev/docs/quick-start) · [API reference](https://raf-query.katt.dev/docs/api-reference) · [GitHub](https://github.com/KATT/raf-query)

> [!NOTE]
> raf-query is early. The API can still change between minor releases, and you use it at your own risk.

## Install

```bash
npm install @raf-query/react effect
```

Apps never import `effect` unless they write Effect code. Requires React 19.2 or newer.

## Usage

A query is a factory. The loader and the component call the same one. A paged list, such as comments, uses `infiniteQueryOptions`.

```tsx
import { infiniteQueryOptions, queryOptions } from "@raf-query/react";

export function postQuery(input: { slug: string }) {
	return queryOptions({
		queryKey: ["post", input.slug],
		queryFn: () => getPost(input.slug),
	});
}

export function commentsQuery(input: { slug: string }) {
	return infiniteQueryOptions({
		queryKey: ["comments", input.slug],
		queryFn: (context) =>
			listComments({ cursor: context.pageParam, slug: input.slug }),
		initialPageParam: 0,
		getNextPageParam: (lastPage) => lastPage.nextCursor,
	});
}
```

**`prefetch`** starts the request and returns a handle at once. The page renders now; `use()` suspends whatever is still loading, under its Suspense fallback.

```tsx
import { type QueryHandle, useQuery } from "@raf-query/react";
import { Suspense, use } from "react";

export const Route = createFileRoute("/posts/$slug")({
	loader: (args) => {
		const qc = args.context.queryClient;
		const { slug } = args.params;
		return {
			comments: qc.prefetch(commentsQuery, { slug }),
			post: qc.prefetch(postQuery, { slug }),
		};
	},
	component: PostPage,
});

function PostPage() {
	const data = Route.useLoaderData();
	const [postPromise] = useQuery(postQuery, data.post);
	const post = use(postPromise);
	return (
		<article>
			<h1>{post.title}</h1>
			<Suspense fallback={<CommentsSkeleton />}>
				<Comments handle={data.comments} />
			</Suspense>
		</article>
	);
}

function Comments(props: { handle: QueryHandle<typeof commentsQuery> }) {
	const [pagesPromise] = useQuery(commentsQuery, props.handle);
	const pages = use(pagesPromise);
	return pages.pages
		.flatMap((page) => page.items)
		.map((comment) => (
			<p key={comment.id}>
				<strong>{comment.author}</strong> {comment.body}
			</p>
		));
}
```

**`ensure`** waits until the data is cached, so the navigation holds. `useQuery` returns the data itself for that handle, not a promise. Await the post and its comments together with [`allKeyed`](https://raf-query.katt.dev/docs/starting-queries#awaiting-several-queries) — a record of promises in, the same record out — so one wait never delays the other.

```tsx
import { allKeyed, useQuery } from "@raf-query/react";

export const Route = createFileRoute("/posts/$slug")({
	loader: (args) => {
		const qc = args.context.queryClient;
		const { slug } = args.params;
		return allKeyed({
			comments: qc.ensure(commentsQuery, { slug }),
			post: qc.ensure(postQuery, { slug }),
		});
	},
	component: PostPage,
});

function PostPage() {
	const data = Route.useLoaderData();
	// Both already waited, so these are the data itself.
	const [post] = useQuery(postQuery, data.post);
	const [pages] = useQuery(commentsQuery, data.comments);
	return (
		<article>
			<h1>{post.title}</h1>
			{pages.pages
				.flatMap((page) => page.items)
				.map((comment) => (
					<p key={comment.id}>
						<strong>{comment.author}</strong> {comment.body}
					</p>
				))}
		</article>
	);
}
```

## Entry points

| Import                             | Use                                                                                                                                               |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@raf-query/react`                 | `QueryClientProvider`, `QueryProvider`, `useQuery`, `useWaterfall`, `useIsFetching`, `HydrationBoundary`, and all of core, `QueryClient` included |
| `@raf-query/react/tanstack-router` | [TanStack Start and Router](https://raf-query.katt.dev/docs/tanstack-start) SSR streaming                                                         |
| `@raf-query/react/devtools`        | The [devtools](https://raf-query.katt.dev/docs/devtools) panel; omit the element to tree-shake it                                                 |

## License

MIT
