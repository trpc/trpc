<script lang="ts">
	import { type QueryHandle, useQuery } from "@raf-query/experimental-svelte";

	import { postQuery } from "#lib/queries.ts";

	const props: { post: QueryHandle<typeof postQuery> } = $props();

	const post = useQuery(postQuery, () => props.post);
</script>

{#await post.promise}
	<p>Loading…</p>
{:then data}
	<h1>{data.title}</h1>
{:catch error}
	<p role="alert">{error.message}</p>
{/await}
