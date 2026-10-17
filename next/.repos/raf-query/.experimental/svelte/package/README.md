# @raf-query/experimental-svelte

Experiment, not published: raf-query for Svelte 5.7 or newer, built on runes. Start queries in SvelteKit `load` functions or on the server, pass serializable handles to components, and read them with `useQuery`. The draft guide is [`../docs/svelte.md`](../docs/svelte.md), and [`../README.md`](../README.md) says how to make it a real package.

## Usage

A query is a factory. Whatever starts the query and the component that reads it call the same one.

```ts
import { queryOptions } from "@raf-query/experimental-svelte";

export function postQuery(input: { slug: string }) {
	return queryOptions({
		queryKey: ["post", input.slug],
		queryFn: () => getPost(input.slug),
	});
}
```

Provide a client once, in the root layout:

```svelte
<script lang="ts">
	import { QueryClient, QueryClientProvider } from "@raf-query/experimental-svelte";

	const { children } = $props();
	const queryClient = new QueryClient();
</script>

<QueryClientProvider client={queryClient}>
	{@render children()}
</QueryClientProvider>
```

**`prefetch`** starts the request and returns a handle at once. `useQuery` reads it: `data` is `undefined` until the request settles. Pass the handle as a getter so the component follows new ones.

```svelte
<script lang="ts">
	import { type QueryHandle, useQuery } from "@raf-query/experimental-svelte";

	const props: { post: QueryHandle<typeof postQuery> } = $props();
	const post = useQuery(postQuery, () => props.post);
</script>

{#if post.data}
	<h1>{post.data.title}</h1>
{:else}
	<p>Loading…</p>
{/if}
```

A handle from **`ensure`** or **`fetch`**, such as one a server `load` returns, already holds its data, so `data` is never `undefined` for it, and the server's HTML has it.
