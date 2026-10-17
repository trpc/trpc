<script lang="ts">
	import { type QueryHandleWithData, useQuery } from "@raf-query/experimental-svelte";

	import { postQuery } from "./queries.ts";

	const props: { post: QueryHandleWithData<typeof postQuery> } = $props();

	const post = useQuery(postQuery, () => props.post);
</script>

<article>
	<h1>{post.data.title}</h1>
	<p>{post.data.body}</p>
	{#if post.isFetching}<small>Refreshing…</small>{/if}
</article>
