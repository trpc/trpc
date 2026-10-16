import { QueryClient, QueryClientProvider, useQuery } from "@raf-query/react";
import { setupRouterIntegration } from "@raf-query/react/tanstack-router";
import {
	createRootRouteWithContext,
	createRoute,
	createRouter,
	Outlet,
} from "@tanstack/react-router";
import { Suspense } from "react";

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
		const comments = qc.prefetch(commentsQuery, { issueId: id });
		const issue = await qc.ensure(issueQuery, { id });
		return { comments, issue };
	},
	path: "/issues/$issueId",
});

function IssuePage() {
	const data = issueRoute.useLoaderData();
	const [issue] = useQuery(issueQuery, data.issue);
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
	const queryClient = new QueryClient({ defaults: { staleTime: 5000 } });
	const router = createRouter({
		context: { queryClient },
		defaultPreload: "intent",
		defaultPreloadStaleTime: 0,
		routeTree: rootRoute.addChildren([issueRoute]),
		Wrap: (props) => (
			<QueryClientProvider client={queryClient}>
				{props.children}
			</QueryClientProvider>
		),
	});
	setupRouterIntegration({ queryClient, router });
	return router;
}
