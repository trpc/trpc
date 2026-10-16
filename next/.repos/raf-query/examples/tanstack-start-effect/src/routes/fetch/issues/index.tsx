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

export const Route = createFileRoute("/fetch/issues/")({
	validateSearch: Schema.toStandardSchemaV1(IssueListInput),
	loaderDeps: (args) => args.search,
	loader: (args) => {
		const qc = args.context.queryClient;
		// `fetch` waits for fresh data: on a cache miss, and when the cached
		// data is stale.
		return allKeyed({
			counts: qc.fetch(issueCountsQuery),
			issues: qc.fetch(issueListQuery, args.deps),
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
