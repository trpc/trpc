import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Suspense } from "react";

import { Comments } from "./comments.tsx";
import { EditTitle, IssueTitle } from "./issue.tsx";
import { commentsQuery, issueQuery } from "./queries.ts";

const noop = () => {};

/** A factory, a loader-style prefetch, and a suspense reader. */
export async function queryApp() {
	const queryClient = new QueryClient();
	await queryClient.query(issueQuery({ id: 1 })).catch(noop);
	return (
		<QueryClientProvider client={queryClient}>
			<Suspense fallback="Loading">
				<IssueTitle id={1} />
			</Suspense>
		</QueryClientProvider>
	);
}

/** Plus a paged query with "Load more". */
export async function pagedApp() {
	const queryClient = new QueryClient();
	await Promise.all([
		queryClient.query(issueQuery({ id: 1 })).catch(noop),
		queryClient.infiniteQuery(commentsQuery({ issueId: 1 })).catch(noop),
	]);
	return (
		<QueryClientProvider client={queryClient}>
			<Suspense fallback="Loading">
				<IssueTitle id={1} />
				<Comments issueId={1} />
			</Suspense>
		</QueryClientProvider>
	);
}

/** Plus a form action that writes and invalidates. */
export async function actionsApp() {
	const queryClient = new QueryClient();
	const [issue] = await Promise.all([
		queryClient.query(issueQuery({ id: 1 })),
		queryClient.infiniteQuery(commentsQuery({ issueId: 1 })).catch(noop),
	]);
	return (
		<QueryClientProvider client={queryClient}>
			<EditTitle issue={issue} />
			<Suspense fallback="Loading">
				<Comments issueId={1} />
			</Suspense>
		</QueryClientProvider>
	);
}
