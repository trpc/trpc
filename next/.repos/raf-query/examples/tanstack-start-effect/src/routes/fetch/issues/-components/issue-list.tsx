import { type QueryHandleWithData, useQuery } from "@raf-query/react";
import { Card } from "@examples/ui/components/card";
import {
	IssueListSummary,
	IssueRow,
	issueRowClassName,
	IssueRowSkeletons,
	NoIssues,
} from "@examples/kit/components/issue-list";
import { LoadMore } from "@examples/kit/components/load-more";
import { cn } from "@examples/ui/lib/utils";
import { Link } from "@tanstack/react-router";

import { StatusSelect } from "~/components/status-select.tsx";
import { issueListQuery } from "~/queries.ts";

export function IssueList(props: {
	readonly handle: QueryHandleWithData<typeof issueListQuery>;
}) {
	const [pages, list] = useQuery(issueListQuery, props.handle, {
		throwOnError: true,
		whilePending: "previous",
	});
	const lastPage = pages.pages.at(-1);
	const total = lastPage?.total ?? 0;
	const shown = pages.pages.reduce((sum, page) => sum + page.issues.length, 0);

	return (
		<div
			aria-busy={list.isPrevious || list.isFetchingNextPage}
			className={cn(
				"grid gap-4 transition-opacity",
				list.isPrevious && "opacity-50",
			)}
		>
			<IssueListSummary shown={shown} total={total} />
			<Card className="gap-0 divide-y py-0">
				{shown === 0 ? <NoIssues /> : null}
				{pages.pages.map((page, index) => (
					<div
						className={cn(
							"divide-y",
							index > 0 && "animate-in duration-500 fade-in",
						)}
						key={pages.pageParams[index]}
					>
						{page.issues.map((issue) => (
							<Link
								className={issueRowClassName}
								key={issue.id}
								params={{ issueId: String(issue.id) }}
								to="/fetch/issues/$issueId"
							>
								<IssueRow issue={issue}>
									<StatusSelect issueId={issue.id} status={issue.status} />
								</IssueRow>
							</Link>
						))}
					</div>
				))}
				{list.isFetchingNextPage ? (
					<IssueRowSkeletons
						count={Math.min(lastPage?.issues.length ?? 0, total - shown)}
					/>
				) : null}
			</Card>
			{list.hasNextPage && !list.isFetchingNextPage ? (
				<LoadMore
					onLoad={() => {
						void list.fetchNextPage();
					}}
				/>
			) : null}
		</div>
	);
}
