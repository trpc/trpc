import { createApp } from "vue";
import App from "../App.vue";
import {
	QueryClient,
	type QueryHandle,
	QueryPlugin,
	useIsFetching,
	useQuery,
	useWaterfall,
	queryOptions,
} from "@raf-query/experimental-vue";
import { computed } from "vue";
import { postQuery } from "../queries.ts";

// #region plugin
createApp(App).use(QueryPlugin, { client: new QueryClient() }).mount("#app");
// #endregion plugin

declare function getAuthor(id: number): Promise<{ name: string }>;

declare const props: { post: QueryHandle<typeof postQuery> };

// #region without-suspense
const post = useQuery(postQuery, () => props.post);
const title = computed(() => post.data?.title ?? "Loading…");
// #endregion without-suspense
title.value;

function authorQuery(input: { id: number }) {
	return queryOptions({
		queryKey: ["author", input.id],
		queryFn: () => getAuthor(input.id),
	});
}

declare const authorId: number;

// #region waterfall
const authorHandle = useWaterfall(authorQuery, () => ({ id: authorId }));
const author = useQuery(authorQuery, authorHandle);
// #endregion waterfall
author.data;

// #region is-fetching
const fetching = useIsFetching();
const busy = computed(() => fetching.value > 0);
// #endregion is-fetching
busy.value;
