<script lang="ts">
	import {
		type QueryHandleWithData,
		useQuery,
		useQueryClient,
	} from "@raf-query/experimental-svelte";

	import { addComment } from "./api.ts";
	import { commentsQuery } from "./queries.ts";

	const props: { comments: QueryHandleWithData<typeof commentsQuery> } =
		$props();

	const comments = useQuery(commentsQuery, () => props.comments);
	const qc = useQueryClient();
	let body = $state("");

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		await addComment({ body, slug: props.comments.input.slug });
		body = "";
		await qc.invalidate(commentsQuery, props.comments.input);
	}
</script>

<ul>
	{#each comments.data.pages.flatMap((page) => page.items) as comment (comment.id)}
		<li>{comment.body}</li>
	{/each}
</ul>
{#if comments.hasNextPage}
	<button
		disabled={comments.isFetchingNextPage}
		onclick={() => comments.fetchNextPage()}
	>
		Load more
	</button>
{/if}
<form onsubmit={submit}>
	<input bind:value={body} />
</form>
