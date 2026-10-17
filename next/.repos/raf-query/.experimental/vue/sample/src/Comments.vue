<script setup lang="ts">
// #region script
import {
	type QueryHandle,
	useQuery,
	useQueryClient,
} from "@raf-query/experimental-vue";
import { ref } from "vue";

import { addComment } from "./api.ts";
import { commentsQuery } from "./queries.ts";

const props = defineProps<{ comments: QueryHandle<typeof commentsQuery> }>();

const comments = useQuery(commentsQuery, () => props.comments);
await comments.promise;

const qc = useQueryClient();
const body = ref("");

async function submit() {
	await addComment({ body: body.value, slug: props.comments.input.slug });
	body.value = "";
	await qc.invalidate(commentsQuery, props.comments.input);
}
// #endregion script
</script>

<template>
	<!-- #region template -->
	<ul>
		<li
			v-for="comment in comments.data?.pages.flatMap((page) => page.items)"
			:key="comment.id"
		>
			{{ comment.body }}
		</li>
	</ul>
	<button
		v-if="comments.hasNextPage"
		:disabled="comments.isFetchingNextPage"
		@click="comments.fetchNextPage()"
	>
		Load more
	</button>
	<form @submit.prevent="submit">
		<input v-model="body" />
	</form>
	<!-- #endregion template -->
</template>
