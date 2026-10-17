<script setup lang="ts">
// #region script
import { type QueryHandle, useQuery } from "@raf-query/experimental-vue";

import Comments from "./Comments.vue";
import { commentsQuery, postQuery } from "./queries.ts";

const props = defineProps<{
	comments: QueryHandle<typeof commentsQuery>;
	post: QueryHandle<typeof postQuery>;
}>();

const post = useQuery(postQuery, () => props.post);
await post.promise;
// #endregion script
</script>

<template>
	<!-- #region template -->
	<article v-if="post.data">
		<h1>{{ post.data.title }}</h1>
		<p>{{ post.data.body }}</p>
		<small v-if="post.isFetching">Refreshing…</small>
		<Comments :comments="props.comments" />
	</article>
	<!-- #endregion template -->
</template>
