<script lang="ts">
	import { type QueryHandleWithData, useQuery, useWaterfall } from "@raf-query/experimental-svelte";

	import { authorQuery, postQuery } from "#lib/queries.ts";

	const props: { post: QueryHandleWithData<typeof postQuery> } = $props();

	const post = useQuery(postQuery, () => props.post);
	const authorHandle = useWaterfall(authorQuery, () => ({
		id: post.data.authorId,
	}));
	const author = useQuery(authorQuery, authorHandle);
</script>

<p>By {author.data?.name ?? "…"}</p>
