import { QueryClient, useSuspenseQuery } from "@tanstack/react-query";
import {
	createRootRouteWithContext,
	createRoute,
	createRouter,
	Outlet,
} from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { Suspense } from "react";

import { Comments } from "./comments.tsx";
import { EditTitle } from "./issue.tsx";
import { commentsQuery, issueQuery } from "./queries.ts";

const noop = () => {};

const rootRoute = createRootRouteWithContext<{
	readonly queryClient: QueryClient;
}>()({ component: Outlet });

const issueRoute = createRoute({
	component: IssuePage,
	getParentRoute: () => rootRoute,
	loader: async (args) => {
		const qc = args.context.queryClient;
		const id = Number(args.params.issueId);
		qc.infiniteQuery(commentsQuery({ issueId: id })).catch(noop);
		await qc.query({ ...issueQuery({ id }), staleTime: "static" });
	},
	path: "/issues/$issueId",
});

function IssuePage() {
	const params = issueRoute.useParams();
	const id = Number(params.issueId);
	const issue = useSuspenseQuery(issueQuery({ id })).data;
	return (
		<article>
			<EditTitle issue={issue} />
			<Suspense fallback="Loading" key={issue.id}>
				<Comments issueId={id} />
			</Suspense>
		</article>
	);
}

/** The Start example's setup with TanStack's own SSR integration. */
export function createAppRouter() {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { staleTime: 5000 } },
	});
	const router = createRouter({
		context: { queryClient },
		defaultPreload: "intent",
		defaultPreloadStaleTime: 0,
		routeTree: rootRoute.addChildren([issueRoute]),
	});
	// Streams the server cache to the browser and wraps the app in `QueryClientProvider`.
	setupRouterSsrQueryIntegration({ queryClient, router });
	return router;
}
