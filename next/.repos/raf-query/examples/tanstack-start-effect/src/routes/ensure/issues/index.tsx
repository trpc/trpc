import { IssueListSkeleton } from "@examples/kit/components/issue-list";
import { Skeleton } from "@examples/ui/components/skeleton";
import { allKeyed } from "@raf-query/react";
import { createFileRoute } from "@tanstack/react-router";
import { Schema } from "effect";
import { Suspense } from "react";

import { issueCountsQuery, issueListQuery } from "~/queries.ts";
import { IssueListInput } from "~/rpc.ts";

import { IssueList } from "./-components/issue-list.tsx";
import { StatusFilter } from "./-components/status-filter.tsx";

export const Route = createFileRoute("/ensure/issues/")({
	validateSearch: Schema.toStandardSchemaV1(IssueListInput),
	loaderDeps: (args) => args.search,
	loader: (args) => {
		const qc = args.context.queryClient;
		// `ensure` waits for data the cache doesn't have. Cached data, even
		// stale, comes back at once and refetches behind the page.
		return allKeyed({
			counts: qc.ensure(issueCountsQuery),
			issues: qc.ensure(issueListQuery, args.deps),
		});
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
