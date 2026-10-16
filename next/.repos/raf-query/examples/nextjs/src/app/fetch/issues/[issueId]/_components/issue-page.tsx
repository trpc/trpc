"use client";

import { CommentsSkeleton } from "@examples/kit/components/comments";
import {
	IssueBodySkeleton,
	StatusSkeleton,
} from "@examples/kit/components/issue-page";
import { AssigneeCardSkeleton } from "@examples/kit/components/user";
import { Button, buttonVariants } from "@examples/ui/components/button";
import { cn } from "@examples/ui/lib/utils";
import { Separator } from "@examples/ui/components/separator";
import { type QueryHandleWithData, useQuery } from "@raf-query/react";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { EditBody } from "~/components/edit-body.tsx";
import { EditTitle } from "~/components/edit-title.tsx";
import { AppLink } from "~/components/settings.tsx";
import { StatusSelect } from "~/components/status-select.tsx";
import { assigneeQuery, commentsQuery, issueQuery } from "~/queries.ts";

import { AssigneeCard } from "./assignee-card.tsx";
import { Comments } from "./comments.tsx";

export function IssuePage(props: {
	readonly assignee: QueryHandleWithData<typeof assigneeQuery>;
	readonly comments: QueryHandleWithData<typeof commentsQuery>;
	readonly issue: QueryHandleWithData<typeof issueQuery>;
}) {
	const id = props.issue.input.id;

	return (
		<div className="grid gap-6">
			<IssueNav id={id} />
			{/* On phones the properties sit between the body and the comments. */}
			<div className="grid gap-x-8 gap-y-6 md:grid-cols-[1fr_240px]">
				<article className="grid content-start gap-6 md:col-start-1">
					<Suspense fallback={<IssueBodySkeleton id={id} />}>
						<IssueBody handle={props.issue} />
					</Suspense>
				</article>
				<aside className="grid content-start gap-4 md:col-start-2 md:row-span-2 md:row-start-1">
					<section className="grid gap-3 rounded-lg border p-3">
						<h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
							Properties
						</h2>
						<div className="flex items-center justify-between gap-3">
							<span className="text-sm text-muted-foreground">Status</span>
							<Suspense fallback={<StatusSkeleton />}>
								<IssueStatus handle={props.issue} />
							</Suspense>
						</div>
					</section>
					<Suspense fallback={<AssigneeCardSkeleton />}>
						<AssigneeCard handle={props.assignee} />
					</Suspense>
				</aside>
				<div className="grid gap-6 md:col-start-1">
					<Separator />
					<Suspense fallback={<CommentsSkeleton />}>
						<Comments handle={props.comments} />
					</Suspense>
				</div>
			</div>
		</div>
	);
}

/** Back, previous, and next come from the URL, so the bar renders before the issue. */
function IssueNav(props: { readonly id: number }) {
	return (
		<nav className="flex items-center gap-2">
			<AppLink
				className={cn(buttonVariants({ size: "sm", variant: "ghost" }))}
				href="/fetch/issues"
			>
				<ArrowLeft /> All issues
			</AppLink>
			<div className="ml-auto flex gap-1">
				{props.id > 1 ? (
					<AppLink
						aria-label="Previous issue"
						className={cn(buttonVariants({ size: "icon", variant: "outline" }))}
						href={`/fetch/issues/${props.id - 1}`}
						title="Previous issue"
					>
						<ChevronLeft />
					</AppLink>
				) : (
					<Button
						aria-label="Previous issue"
						disabled
						size="icon"
						title="Previous issue"
						variant="outline"
					>
						<ChevronLeft />
					</Button>
				)}
				<AppLink
					aria-label="Next issue"
					className={cn(buttonVariants({ size: "icon", variant: "outline" }))}
					href={`/fetch/issues/${props.id + 1}`}
					title="Next issue"
				>
					<ChevronRight />
				</AppLink>
			</div>
		</nav>
	);
}

function useIssue(handle: QueryHandleWithData<typeof issueQuery>) {
	const [issue] = useQuery(issueQuery, handle);
	if (!issue) {
		notFound();
	}
	return issue;
}

function IssueBody(props: {
	readonly handle: QueryHandleWithData<typeof issueQuery>;
}) {
	const issue = useIssue(props.handle);

	return (
		<div className="grid gap-6">
			<EditTitle issue={issue} />
			<p className="text-sm text-muted-foreground">
				Opened {new Date(issue.createdAt).toDateString()}
			</p>
			<EditBody issue={issue} />
		</div>
	);
}

function IssueStatus(props: {
	readonly handle: QueryHandleWithData<typeof issueQuery>;
}) {
	const issue = useIssue(props.handle);
	return <StatusSelect align="end" issueId={issue.id} status={issue.status} />;
}
