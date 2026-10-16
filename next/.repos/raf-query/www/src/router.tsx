import {
	canDehydrate,
	QueryClient,
	QueryClientProvider,
} from "@raf-query/react";
import { QueryDevtools } from "@raf-query/react/devtools";
import { setupRouterIntegration } from "@raf-query/react/tanstack-router";
import { createRouter } from "@tanstack/react-router";

import { NotFound } from "./components/not-found.tsx";
import { routeTree } from "./routeTree.gen.ts";

export function getRouter() {
	const queryClient = new QueryClient();
	const router = createRouter({
		context: { queryClient },
		defaultNotFoundComponent: NotFound,
		// Hovering a link loads the page's content chunk into the query cache,
		// so the click renders without waiting.
		defaultPreload: "intent",
		// The query cache decides what's fresh; loaders always run and dedupe there.
		defaultPreloadStaleTime: 0,
		routeTree,
		scrollRestoration: true,
		Wrap: (props) => (
			<QueryClientProvider client={queryClient}>
				{props.children}
				{import.meta.env.DEV ? (
					<QueryDevtools buttonPosition="bottom-left" />
				) : null}
			</QueryClientProvider>
		),
	});
	setupRouterIntegration({
		// Demo entries hold components, which can't be serialized; the browser
		// loads their chunks itself.
		dehydrateOptions: {
			filter: (query) => query.key[0] === "doc" && canDehydrate(query),
		},
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
