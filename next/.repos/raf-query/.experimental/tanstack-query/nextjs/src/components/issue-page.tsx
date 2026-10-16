"use client";

import { Button, buttonVariants } from "@examples/ui/components/button";
import { cn } from "@examples/ui/lib/utils";
import { Separator } from "@examples/ui/components/separator";
import {
	type QueryHandle,
	useQuery,
} from "@raf-query/experimental-tanstack-react-query";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { Suspense, use } from "react";

import { assigneeQuery, commentsQuery, issueQuery } from "~/queries.ts";

import { Comments, CommentsSkeleton } from "./comments.tsx";
import { EditTitle } from "./edit-title.tsx";
import { StatusBadge } from "./status-badge.tsx";
import { AssigneeCard, AssigneeCardSkeleton } from "./user.tsx";

export function IssuePage(props: {
	readonly assignee: QueryHandle<typeof assigneeQuery>;
	readonly comments: QueryHandle<typeof commentsQuery>;
	readonly issue: QueryHandle<typeof issueQuery>;
}) {
	const [issuePromise] = useQuery(issueQuery, props.issue);
	const issue = use(issuePromise);

	return (
		<div className="grid gap-6">
			<nav className="flex items-center gap-2">
				<Link
					className={cn(buttonVariants({ size: "sm", variant: "ghost" }))}
					href="/issues"
				>
					<ArrowLeft /> All issues
				</Link>
				<div className="ml-auto flex gap-1">
					{issue.id > 1 ? (
						<Link
							aria-label="Previous issue"
							className={cn(
								buttonVariants({ size: "icon", variant: "outline" }),
							)}
							href={`/issues/${issue.id - 1}`}
						>
							<ChevronLeft />
						</Link>
					) : (
						<Button
							aria-label="Previous issue"
							disabled
							size="icon"
							variant="outline"
						>
							<ChevronLeft />
						</Button>
					)}
					<Link
						aria-label="Next issue"
						className={cn(buttonVariants({ size: "icon", variant: "outline" }))}
						href={`/issues/${issue.id + 1}`}
					>
						<ChevronRight />
					</Link>
				</div>
			</nav>
			<div className="grid gap-8 md:grid-cols-[1fr_240px]">
				<article className="grid content-start gap-6">
					<EditTitle issue={issue} />
					<div className="flex items-center gap-3 text-sm text-muted-foreground">
						<StatusBadge status={issue.status} />
						Opened {new Date(issue.createdAt).toDateString()}
					</div>
					<p className="text-sm whitespace-pre-line">{issue.body}</p>
					<Separator />
					<Suspense fallback={<CommentsSkeleton />} key={issue.id}>
						<Comments handle={props.comments} />
					</Suspense>
				</article>
				<aside>
					<Suspense fallback={<AssigneeCardSkeleton />}>
						<AssigneeCard handle={props.assignee} />
					</Suspense>
				</aside>
			</div>
		</div>
	);
}
