import {
	ensureData,
	prefetch,
	QueryClient,
	QueryClientProvider,
} from "@raf-query/experimental-tanstack-react-query";
import { Suspense } from "react";

import { Comments } from "./comments.tsx";
import { EditTitle, IssueTitle } from "./issue.tsx";
import { commentsQuery, issueQuery } from "./queries.ts";

/** A factory, a loader-style `prefetch`, and a `useQuery` reader. */
export function queryApp() {
	const queryClient = new QueryClient();
	const issue = prefetch(queryClient, issueQuery, { id: 1 });
	return (
		<QueryClientProvider client={queryClient}>
			<Suspense fallback="Loading">
				<IssueTitle handle={issue} />
			</Suspense>
		</QueryClientProvider>
	);
}

/** Plus a paged query with "Load more". */
export function pagedApp() {
	const queryClient = new QueryClient();
	const issue = prefetch(queryClient, issueQuery, { id: 1 });
	const comments = prefetch(queryClient, commentsQuery, { issueId: 1 });
	return (
		<QueryClientProvider client={queryClient}>
			<Suspense fallback="Loading">
				<IssueTitle handle={issue} />
				<Comments handle={comments} />
			</Suspense>
		</QueryClientProvider>
	);
}

/** Plus a form action that writes and invalidates. */
export async function actionsApp() {
	const queryClient = new QueryClient();
	const issue = await ensureData(queryClient, issueQuery, { id: 1 });
	const comments = prefetch(queryClient, commentsQuery, { issueId: 1 });
	return (
		<QueryClientProvider client={queryClient}>
			<EditTitle issue={issue} />
			<Suspense fallback="Loading">
				<Comments handle={comments} />
			</Suspense>
		</QueryClientProvider>
	);
}
