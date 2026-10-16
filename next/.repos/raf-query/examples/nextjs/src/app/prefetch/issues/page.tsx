import { IssueListInput } from "@examples/db/types";
import { IssueListSkeleton } from "@examples/kit/components/issue-list";
import { Skeleton } from "@examples/ui/components/skeleton";
import { HydrationBoundary } from "@raf-query/react";
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
	// `prefetch` starts each query and returns its handle at once. The page
	// streams in behind skeletons as the data lands.
	const handles = {
		counts: qc.prefetch(issueCountsQuery),
		issues: qc.prefetch(issueListQuery, input),
	};

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
