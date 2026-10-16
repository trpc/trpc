import { IssueListInput } from "@examples/db/types";
import { IssueListSkeleton } from "@examples/kit/components/issue-list";
import { Skeleton } from "@examples/ui/components/skeleton";
import { dehydrate } from "@raf-query/react";
import { HydrationBoundary } from "@raf-query/react";
import { Suspense } from "react";

import { queryClientContext } from "~/query-client.ts";
import { issueCountsQuery, issueListQuery } from "~/queries.ts";
import { withRequest } from "~/settings.ts";

import type { Route } from "./+types/route";
import { IssueList } from "./components/issue-list.tsx";
import { StatusFilter } from "./components/status-filter.tsx";

export function loader(args: Route.LoaderArgs) {
	return withRequest(args.request, () => {
		const input = IssueListInput.parse(
			Object.fromEntries(new URL(args.request.url).searchParams),
		);
		const queryClient = args.context.get(queryClientContext);
		// `prefetch` starts each query and returns its handle at once. The page
		// streams in behind skeletons.
		const handles = {
			counts: queryClient.prefetch(issueCountsQuery),
			issues: queryClient.prefetch(issueListQuery, input),
		};
		return {
			counts: handles.counts,
			dehydratedState: dehydrate(queryClient),
			input,
			issues: handles.issues,
		};
	});
}

export default function IssuesPage(props: Route.ComponentProps) {
	return (
		<HydrationBoundary state={props.loaderData.dehydratedState}>
			<div className="grid gap-6 md:grid-cols-[180px_1fr] md:gap-8">
				<Suspense fallback={<Skeleton className="h-20 md:h-48" />}>
					<StatusFilter
						counts={props.loaderData.counts}
						current={props.loaderData.input}
					/>
				</Suspense>
				<Suspense fallback={<IssueListSkeleton />}>
					<IssueList handle={props.loaderData.issues} />
				</Suspense>
			</div>
		</HydrationBoundary>
	);
}
