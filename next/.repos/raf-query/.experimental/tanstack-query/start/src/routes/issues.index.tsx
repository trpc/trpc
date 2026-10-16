import { IssueListInput } from "@examples/db/types";
import { Skeleton } from "@examples/ui/components/skeleton";
import { prefetch } from "@raf-query/experimental-tanstack-react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";

import { IssueList, IssueListSkeleton } from "~/components/issue-list.tsx";
import { StatusFilter } from "~/components/status-filter.tsx";
import { issueCountsQuery, issueListQuery } from "~/queries.ts";

export const Route = createFileRoute("/issues/")({
	validateSearch: IssueListInput,
	loaderDeps: (args) => args.search,
	loader: (args) => {
		const qc = args.context.queryClient;
		return {
			counts: prefetch(qc, issueCountsQuery),
			issues: prefetch(qc, issueListQuery, args.deps),
		};
	},
	component: IssuesPage,
});

function IssuesPage() {
	const data = Route.useLoaderData();
	const search = Route.useSearch();

	return (
		<div className="grid gap-8 md:grid-cols-[180px_1fr]">
			<Suspense fallback={<Skeleton className="h-48" />}>
				<StatusFilter counts={data.counts} current={search} />
			</Suspense>
			<Suspense fallback={<IssueListSkeleton />}>
				<IssueList handle={data.issues} />
			</Suspense>
		</div>
	);
}
