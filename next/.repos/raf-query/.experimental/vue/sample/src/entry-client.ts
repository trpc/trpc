// #region client
import {
	type DehydratedState,
	hydrate,
	QueryClient,
} from "@raf-query/experimental-vue";

import { createApp } from "./app.ts";

declare global {
	interface Window {
		dehydratedState?: DehydratedState;
	}
}

const qc = new QueryClient();
if (window.dehydratedState) {
	hydrate(qc, window.dehydratedState);
}
const { app, router } = createApp(qc);
await router.isReady();
app.mount("#app");
// #endregion client
