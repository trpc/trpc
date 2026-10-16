import { IssueListInput } from "@examples/db/types";
import { IssueListSkeleton } from "@examples/kit/components/issue-list";
import { Skeleton } from "@examples/ui/components/skeleton";
import { allKeyed, HydrationBoundary } from "@raf-query/react";
import { Suspense } from "react";

import { issueCountsQuery, issueListQuery } from "~/queries.ts";
import { getQueryClient } from "~/query-client.ts";

import { IssueList } from "./_components/issue-list.tsx";
import { StatusFilter } from "./_components/status-filter.tsx";

export default async function IssuesPage(props: {
	readonly searchParams: Promise<
		Record<string, string | ReadonlyArray<string>>
	>;
}) {
	const input = IssueListInput.parse(await props.searchParams);
	const qc = getQueryClient();
	// `ensure` waits for data the cache doesn't have. The server renders
	// every navigation with a new client, so here it waits like `fetch`.
	const handles = await allKeyed({
		counts: qc.ensure(issueCountsQuery),
		issues: qc.ensure(issueListQuery, input),
	});

	return (
		<HydrationBoundary client={qc}>
			<div className="grid gap-6 md:grid-cols-[180px_1fr] md:gap-8">
				<Suspense fallback={<Skeleton className="h-20 md:h-48" />}>
					<StatusFilter counts={handles.counts} current={input} />
				</Suspense>
				<Suspense fallback={<IssueListSkeleton />}>
					<IssueList handle={handles.issues} />
				</Suspense>
			</div>
		</HydrationBoundary>
	);
}
