import { IssueListInput } from "@examples/db/types";
import { IssueListSkeleton } from "@examples/kit/components/issue-list";
import { Skeleton } from "@examples/ui/components/skeleton";
import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";

import { issueCountsQuery, issueListQuery } from "~/queries.ts";

import { IssueList } from "./-components/issue-list.tsx";
import { StatusFilter } from "./-components/status-filter.tsx";

export const Route = createFileRoute("/prefetch/issues/")({
	validateSearch: IssueListInput,
	loaderDeps: (args) => args.search,
	loader: (args) => {
		const qc = args.context.queryClient;
		// `prefetch` starts each query and returns its handle at once. The
		// page shows skeletons until the data lands.
		return {
			counts: qc.prefetch(issueCountsQuery),
			issues: qc.prefetch(issueListQuery, args.deps),
		};
	},
	component: IssuesPage,
});

function IssuesPage() {
	const data = Route.useLoaderData();
	const search = Route.useSearch();

	return (
		<div className="grid gap-6 md:grid-cols-[180px_1fr] md:gap-8">
			<Suspense fallback={<Skeleton className="h-20 md:h-48" />}>
				<StatusFilter counts={data.counts} current={search} />
			</Suspense>
			<Suspense fallback={<IssueListSkeleton />}>
				<IssueList handle={data.issues} />
			</Suspense>
		</div>
	);
}
