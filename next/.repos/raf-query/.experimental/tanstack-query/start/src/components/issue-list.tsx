import {
	type QueryHandle,
	useQuery,
} from "@raf-query/experimental-tanstack-react-query";
import { Card } from "@examples/ui/components/card";
import { LoadMore } from "@examples/kit/components/load-more";
import { Skeleton } from "@examples/ui/components/skeleton";
import { cn } from "@examples/ui/lib/utils";
import { Link } from "@tanstack/react-router";
import { MessageSquare } from "lucide-react";
import { use } from "react";

import { issueListQuery } from "~/queries.ts";

import { StatusBadge } from "./status-badge.tsx";

const dateFormat = new Intl.DateTimeFormat("en", {
	day: "numeric",
	month: "short",
});

// Rows and their skeletons share one fixed height, so a loaded page takes
// exactly the space its skeletons held and nothing below it moves.
const rowClassName = "flex h-12 items-center gap-3 px-4";

export function IssueList(props: {
	readonly handle: QueryHandle<typeof issueListQuery>;
}) {
	const [pagesPromise, list] = useQuery(issueListQuery, props.handle, {
		whilePending: "previous",
	});
	const pages = use(pagesPromise);
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
			<p className="text-sm text-muted-foreground">
				Showing {shown} of {total} issues
			</p>
			<Card className="gap-0 divide-y py-0">
				{shown === 0 ? (
					<p className="p-6 text-sm text-muted-foreground">No issues.</p>
				) : null}
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
								className={cn(rowClassName, "hover:bg-muted/50")}
								key={issue.id}
								params={{ issueId: String(issue.id) }}
								to="/issues/$issueId"
							>
								<span className="w-10 text-sm text-muted-foreground">
									#{issue.id}
								</span>
								<span className="flex-1 truncate font-medium">
									{issue.title}
								</span>
								<span className="flex items-center gap-1 text-xs text-muted-foreground">
									<MessageSquare className="size-3" />
									{issue.commentCount}
								</span>
								<span className="w-14 text-right text-xs text-muted-foreground">
									{dateFormat.format(new Date(issue.createdAt))}
								</span>
								<StatusBadge status={issue.status} />
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

function IssueRowSkeletons(props: { readonly count: number }) {
	return (
		<div className="divide-y">
			{Array.from({ length: props.count }, (_, index) => (
				<div className={rowClassName} key={index}>
					<Skeleton className="h-4 w-10" />
					<Skeleton className="h-4 flex-1" />
					<Skeleton className="h-5 w-20 rounded-full" />
				</div>
			))}
		</div>
	);
}

export function IssueListSkeleton() {
	return (
		<Card className="gap-0 py-0">
			<IssueRowSkeletons count={10} />
		</Card>
	);
}
