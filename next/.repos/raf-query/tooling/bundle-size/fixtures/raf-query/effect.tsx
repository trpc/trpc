import {
	QueryClient,
	QueryClientProvider,
	type QueryHandle,
	queryOptions,
	useQuery,
} from "@raf-query/react";
import { Data, Effect, Schedule } from "effect";
import { Suspense, use } from "react";

import { getIssue } from "../shared/api.ts";

class IssueRequestError extends Data.TaggedError("IssueRequestError")<{
	readonly cause: unknown;
}> {}

export function effectIssueQuery(input: { readonly id: number }) {
	return queryOptions({
		queryFn: () =>
			Effect.tryPromise({
				catch: (cause) => new IssueRequestError({ cause }),
				try: () => getIssue(input.id),
			}),
		queryKey: ["issues", input.id],
		retry: Schedule.exponential("200 millis").pipe(Schedule.upTo({ times: 3 })),
	});
}

function IssueTitle(props: {
	readonly handle: QueryHandle<typeof effectIssueQuery>;
}) {
	const [issuePromise] = useQuery(effectIssueQuery, props.handle, {
		throwOnError: true,
	});
	const issue = use(issuePromise);
	return <h1>{issue.title}</h1>;
}

/** `queryApp` with an Effect `queryFn` and `Schedule` retries. */
export function effectApp() {
	const queryClient = new QueryClient();
	const issue = queryClient.prefetch(effectIssueQuery, { id: 1 });
	return (
		<QueryClientProvider client={queryClient}>
			<Suspense fallback="Loading">
				<IssueTitle handle={issue} />
			</Suspense>
		</QueryClientProvider>
	);
}
