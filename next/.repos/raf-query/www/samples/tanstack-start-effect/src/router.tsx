import { QueryClient, QueryClientProvider } from "@raf-query/react";
import { setupRouterIntegration } from "@raf-query/react/tanstack-router";
import { createRouter } from "@tanstack/react-router";

import { IssueApiLive } from "./issues.ts";
import { routeTree } from "./routeTree.gen.ts";

export function getRouter() {
	const queryClient = new QueryClient({
		defaults: { staleTime: 5000 },
		layer: IssueApiLive,
	});
	const router = createRouter({
		context: { queryClient },
		// The query cache decides what's fresh; loaders always run and dedupe there.
		defaultPreloadStaleTime: 0,
		routeTree,
		Wrap: (props) => (
			<QueryClientProvider client={queryClient}>
				{props.children}
			</QueryClientProvider>
		),
	});
	setupRouterIntegration({ queryClient, router });
	return router;
}
