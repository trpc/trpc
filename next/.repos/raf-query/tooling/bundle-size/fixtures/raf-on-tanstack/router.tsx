import {
	ensure,
	prefetch,
	QueryClient,
	useQuery,
} from "@raf-query/experimental-tanstack-react-query";
import {
	createRootRouteWithContext,
	createRoute,
	createRouter,
	Outlet,
} from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { Suspense, use } from "react";

import { Comments } from "./comments.tsx";
import { EditTitle } from "./issue.tsx";
import { commentsQuery, issueQuery } from "./queries.ts";

const rootRoute = createRootRouteWithContext<{
	readonly queryClient: QueryClient;
}>()({ component: Outlet });

const issueRoute = createRoute({
	component: IssuePage,
	getParentRoute: () => rootRoute,
	loader: async (args) => {
		const qc = args.context.queryClient;
		const id = Number(args.params.issueId);
		const comments = prefetch(qc, commentsQuery, { issueId: id });
		const issue = await ensure(qc, issueQuery, { id });
		return { comments, issue };
	},
	path: "/issues/$issueId",
});

function IssuePage() {
	const data = issueRoute.useLoaderData();
	const [issuePromise] = useQuery(issueQuery, data.issue);
	const issue = use(issuePromise);
	return (
		<article>
			<EditTitle issue={issue} />
			<Suspense fallback="Loading" key={issue.id}>
				<Comments handle={data.comments} />
			</Suspense>
		</article>
	);
}

/** The Start example's setup: loaders start queries, the integration streams them. */
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
