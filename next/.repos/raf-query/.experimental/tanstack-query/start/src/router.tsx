import { QueryClient } from "@raf-query/experimental-tanstack-react-query";
import { createRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";

import { routeTree } from "./routeTree.gen.ts";

export function getRouter() {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { staleTime: 5000 } },
	});
	const router = createRouter({
		context: { queryClient },
		defaultPreload: "intent",
		// The query cache decides what's fresh; loaders always run and dedupe there.
		defaultPreloadStaleTime: 0,
		routeTree,
		scrollRestoration: true,
	});
	// Streams the server cache to the browser, handles `redirect()` thrown in
	// queries, and wraps the app in `QueryClientProvider`.
	setupRouterSsrQueryIntegration({ queryClient, router });
	return router;
}

declare module "@tanstack/react-router" {
	interface Register {
		router: ReturnType<typeof getRouter>;
	}
}
