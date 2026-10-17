<img alt="raf-query logo" height="64" src="www/public/favicon.svg" width="64" />

# raf-query

Render-as-you-fetch data fetching for React.

**[Documentation](https://raf-query.katt.dev)** · [Quick start](https://raf-query.katt.dev/docs/quick-start) · [API reference](https://raf-query.katt.dev/docs/api-reference) · [Examples](#examples)

Queries start in route loaders and React Server Components, travel to components as small serializable **handles**, and are read with React's `use()` under Suspense. Fetch-on-render is an explicitly named escape hatch, not the default.

The cache's mechanics (dedupe, staleness, retries, infinite paging, SSR hydration) follow [TanStack Query](https://tanstack.com/query); the public API is built around loaders, RSC and `use()` instead of `useQuery`-in-render. The cache is written in [Effect](https://effect.website), but apps don't have to use Effect: `queryFn`s return promises, and the client, hooks and integrations speak promises.

> [!NOTE]
> raf-query is early. Both packages are on npm at `0.x`, the API can still change between minor releases, and you use it at your own risk.

## A taste

```tsx
// A query is a factory: the loader and the component call the same one.
export function postQuery(input: { slug: string }) {
	return queryOptions({
		queryKey: ["post", input.slug],
		queryFn: () => getPost(input.slug),
	});
}

export const Route = createFileRoute("/posts/$slug")({
	loader: async (args) => {
		const qc = args.context.queryClient;
		// Comments stream in after the route changes, under the skeleton below.
		const comments = qc.prefetch(commentsQuery, { slug: args.params.slug });
		// The route change waits for the post.
		const post = await qc.ensure(postQuery, { slug: args.params.slug });
		return { comments, post };
	},
	component: PostPage,
});

function PostPage() {
	const data = Route.useLoaderData();
	// The route already waited for this, so it's the post itself.
	const [post] = useQuery(postQuery, data.post);
	//     ^?
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
	// Still loading. use() suspends until the pages stream in.
	const [pagesPromise] = useQuery(commentsQuery, props.handle);
	//     ^?
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

The loader decides when each request starts and whether the navigation waits for it; components only read. The [overview](https://raf-query.katt.dev/docs/overview) explains the idea, and the guides have live demos of caching, pagination, retries, polling and more.

## Install

```bash
npm install @raf-query/react effect
```

See [installation](https://raf-query.katt.dev/docs/installation) for requirements, then set it up for [TanStack Start](https://raf-query.katt.dev/docs/tanstack-start), [React Server Components](https://raf-query.katt.dev/docs/react-server-components) (such as the Next.js App Router) or [React Router](https://raf-query.katt.dev/docs/react-router).

## Packages

| Package                              | Contents                                                                                    |
| ------------------------------------ | ------------------------------------------------------------------------------------------- |
| [`@raf-query/react`](packages/react) | Hooks, and the TanStack Router, RSC and devtools integrations. Re-exports `@raf-query/core` |
| [`@raf-query/core`](packages/core)   | The framework-agnostic `QueryClient` and the Effect-native cache behind it                  |

## Examples

The same issue tracker, built on three frameworks so the integrations can be compared side by side, and once more with Effect and Effect RPC. Each runs live on Vercel, and opens in CodeSandbox, which runs it on a cloud VM:

| Example                                                                   | Framework                             | Try it                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`examples/tanstack-start`](examples/tanstack-start#readme)               | TanStack Start                        | [tanstack-start.raf-query.katt.dev](https://tanstack-start.raf-query.katt.dev) · [Open in CodeSandbox](https://codesandbox.io/p/devbox/github/KATT/raf-query/tree/codesandbox/examples/tanstack-start?file=/apps/tanstack-start/src/routes/prefetch/issues/index.tsx)                             |
| [`examples/nextjs`](examples/nextjs#readme)                               | Next.js App Router                    | [nextjs.raf-query.katt.dev](https://nextjs.raf-query.katt.dev) · [Open in CodeSandbox](https://codesandbox.io/p/devbox/github/KATT/raf-query/tree/codesandbox/examples/nextjs?file=/apps/nextjs/src/app/prefetch/issues/page.tsx)                                                                 |
| [`examples/react-router`](examples/react-router#readme)                   | React Router Framework Mode           | [react-router.raf-query.katt.dev](https://react-router.raf-query.katt.dev) · [Open in CodeSandbox](https://codesandbox.io/p/devbox/github/KATT/raf-query/tree/codesandbox/examples/react-router?file=/apps/react-router/app/routes/prefetch/issues/route.tsx)                                     |
| [`examples/tanstack-start-effect`](examples/tanstack-start-effect#readme) | TanStack Start, Effect and Effect RPC | [tanstack-start-effect.raf-query.katt.dev](https://tanstack-start-effect.raf-query.katt.dev) · [Open in CodeSandbox](https://codesandbox.io/p/devbox/github/KATT/raf-query/tree/codesandbox/examples/tanstack-start-effect?file=/apps/tanstack-start-effect/src/routes/prefetch/issues/index.tsx) |

## Development

See [`.github/DEVELOPMENT.md`](.github/DEVELOPMENT.md). The docs site lives in [`www/`](www#readme).
