<script lang="ts">
	import { HydrationBoundary } from "@raf-query/experimental-svelte";

	import Comments from "#lib/Comments.svelte";
	import Post from "#lib/Post.svelte";

	import type { PageProps } from "./$types";

	const props: PageProps = $props();
</script>

<HydrationBoundary state={props.data.queries}>
	<Post post={props.data.post} />
	<Comments comments={props.data.comments} />
</HydrationBoundary>
