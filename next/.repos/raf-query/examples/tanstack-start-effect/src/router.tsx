import {
	applyStaleTime,
	DEFAULT_STALE_TIME,
	queryTimeDefaults,
} from "@examples/db/types";
import { QueryClient, QueryClientProvider } from "@raf-query/react";
import { QueryDevtools } from "@raf-query/react/devtools";
import { setupRouterIntegration } from "@raf-query/react/tanstack-router";
import { createRouter } from "@tanstack/react-router";

import { forwardedHeaders } from "./forwarded-headers.ts";
import { Issues } from "./issues.ts";
import { routeTree } from "./routeTree.gen.ts";
import { readPrefetch, readStaleTime, toDefaultPreload } from "./settings.ts";

export function getRouter() {
	const staleTime = readStaleTime() ?? DEFAULT_STALE_TIME;
	const queryDefaults = queryTimeDefaults(staleTime);
	// `QueryClient<Issues>`: queries' Effects get the RPC client from the layer.
	const queryClient = new QueryClient({
		defaults: queryDefaults,
		layer: Issues.layer(forwardedHeaders),
	});
	// The cache reads this object live. A server client leaves `gcTime` unset.
	if (!queryClient.isServer) {
		applyStaleTime(queryDefaults, staleTime);
	}
	const router = createRouter({
		context: { queryClient, queryDefaults },
		defaultPreload: toDefaultPreload(readPrefetch()),
		// The query cache decides what's fresh; loaders always run and dedupe there.
		defaultPreloadStaleTime: 0,
		// A revisit waits for its loader, as the URL's verb says. With the
		// default (`"background"`), the router renders the route's last loader
		// data and reruns the loader behind it, so `fetch` would never wait.
		defaultStaleReloadMode: "blocking",
		routeTree,
		scrollRestoration: true,
		Wrap: (props) => (
			<QueryClientProvider client={queryClient}>
				{props.children}
				<QueryDevtools />
			</QueryClientProvider>
		),
	});
	setupRouterIntegration({
		// Failures keep their type across SSR, so `IssueNotFound` matches in the browser.
		dehydrateOptions: { keepErrors: true },
		queryClient,
		router,
	});
	return router;
}

declare module "@tanstack/react-router" {
	interface Register {
		router: ReturnType<typeof getRouter>;
	}
}
