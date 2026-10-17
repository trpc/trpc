// #region app
import { type QueryClient, QueryPlugin } from "@raf-query/experimental-vue";
import { createSSRApp } from "vue";

import App from "./App.vue";
import { createAppRouter } from "./router.ts";

/** One app per request on the server, and one in the browser. */
export function createApp(qc: QueryClient) {
	const router = createAppRouter(qc);
	const app = createSSRApp(App).use(QueryPlugin, { client: qc }).use(router);
	return { app, router };
}
// #endregion app
