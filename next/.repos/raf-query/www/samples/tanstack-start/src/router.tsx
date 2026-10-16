import { QueryClient, QueryClientProvider } from "@raf-query/react";
import { QueryDevtools } from "@raf-query/react/devtools";
import { setupRouterIntegration } from "@raf-query/react/tanstack-router";
import { createRouter } from "@tanstack/react-router";

import { routeTree } from "./routeTree.gen.ts";

export function getRouter() {
	const queryClient = new QueryClient();
	const router = createRouter({
		context: { queryClient },
		defaultPreload: "intent",
		// The query cache decides what's fresh; loaders always run and dedupe there.
		defaultPreloadStaleTime: 0,
		routeTree,
		scrollRestoration: true,
		Wrap: (props) => (
			<QueryClientProvider client={queryClient}>
				{props.children}
				{import.meta.env.DEV ? <QueryDevtools /> : null}
			</QueryClientProvider>
		),
	});
	setupRouterIntegration({ queryClient, router });
	return router;
}
