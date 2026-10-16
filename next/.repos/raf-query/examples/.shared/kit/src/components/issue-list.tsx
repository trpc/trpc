"use client";

import type { Issue } from "@examples/db/types";
import { Card } from "@examples/ui/components/card";
import { Skeleton } from "@examples/ui/components/skeleton";
import { cn } from "@examples/ui/lib/utils";
import { MessageSquare } from "lucide-react";
import type { ReactNode } from "react";

const dateFormat = new Intl.DateTimeFormat("en", {
	day: "numeric",
	month: "short",
});

// Rows and their skeletons share one fixed height, so a loaded page takes
// exactly the space its skeletons held and nothing below it moves.
const rowClassName = "flex h-12 items-center gap-3 px-4";

/** The class for the link each issue row renders in. */
export const issueRowClassName = cn(rowClassName, "group hover:bg-muted/50");

/**
 * An issue row's contents, for inside its link. `children` (the status
 * control) sits in a span that cancels clicks, so using it doesn't navigate.
 */
export function IssueRow(props: {
	readonly children: ReactNode;
	readonly issue: Issue;
}) {
	const issue = props.issue;
	return (
		<>
			<span className="w-10 shrink-0 text-sm text-muted-foreground">
				#{issue.id}
			</span>
			{/* `w-0`: the full title must not set the row's minimum width on phones. */}
			<span className="w-0 flex-1 truncate font-medium">{issue.title}</span>
			<span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground max-sm:hidden">
				<MessageSquare className="size-3" />
				{issue.commentCount}
			</span>
			<span className="w-14 shrink-0 text-right text-xs text-muted-foreground max-sm:hidden">
				{dateFormat.format(new Date(issue.createdAt))}
			</span>
			<span
				className="shrink-0"
				onAuxClick={(event) => {
					event.preventDefault();
				}}
				onClick={(event) => {
					event.preventDefault();
				}}
			>
				{props.children}
			</span>
		</>
	);
}

export function IssueListSummary(props: {
	readonly shown: number;
	readonly total: number;
}) {
	return (
		<p className="text-sm text-muted-foreground">
			Showing {props.shown} of {props.total} issues
		</p>
	);
}

export function NoIssues() {
	return <p className="p-6 text-sm text-muted-foreground">No issues.</p>;
}

export function IssueRowSkeletons(props: { readonly count: number }) {
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
