// #region server
import { dehydrate, Query, QueryClient } from "@raf-query/experimental-vue";
import { renderToString } from "vue/server-renderer";

import { createApp } from "./app.ts";

export async function render(url: string) {
	const qc = new QueryClient({ isServer: true });
	const { app, router } = createApp(qc);
	await router.push(url);
	await router.isReady();
	const html = await renderToString(app);
	const state = dehydrate(qc, {
		filter: (query) => Query.getUnsafe(query).hasData,
	});
	const json = JSON.stringify(state).replaceAll("<", String.raw`\u003c`);
	return {
		html,
		head: `<script>window.dehydratedState = ${json}</script>`,
	};
}
// #endregion server
