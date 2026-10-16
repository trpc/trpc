import { IssueId } from "@examples/db/types";
import { CommentsSkeleton } from "@examples/kit/components/comments";
import {
	IssueBodySkeleton,
	StatusSkeleton,
} from "@examples/kit/components/issue-page";
import { AssigneeCardSkeleton } from "@examples/kit/components/user";
import { Button, buttonVariants } from "@examples/ui/components/button";
import { cn } from "@examples/ui/lib/utils";
import { Separator } from "@examples/ui/components/separator";
import { allKeyed, type QueryHandleWithData, useQuery } from "@raf-query/react";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { Suspense } from "react";

import { EditBody } from "~/components/edit-body.tsx";
import { EditTitle } from "~/components/edit-title.tsx";
import { StatusSelect } from "~/components/status-select.tsx";
import { assigneeQuery, commentsQuery, issueQuery } from "~/queries.ts";

import { AssigneeCard } from "./-components/assignee-card.tsx";
import { Comments } from "./-components/comments.tsx";

export const Route = createFileRoute("/fetch/issues/$issueId")({
	loader: async (args) => {
		const qc = args.context.queryClient;
		const id = Number(args.params.issueId);
		if (!IssueId.safeParse(id).success) {
			throw notFound();
		}
		// `fetch` waits for fresh data: on a cache miss, and when the cached
		// data is stale.
		const handles = await allKeyed({
			assignee: qc.fetch(assigneeQuery, { issueId: id }),
			comments: qc.fetch(commentsQuery, { issueId: id }),
			issue: qc.fetch(issueQuery, { id }),
		});
		if (handles.issue.data === null) {
			throw notFound();
		}
		return handles;
	},
	component: IssuePage,
	// Previous and next stay on this route, so a new id mounts a fresh page.
	remountDeps: (opts) => opts.params,
});

function IssuePage() {
	const data = Route.useLoaderData();
	const id = Number(Route.useParams().issueId);

	return (
		<div className="grid gap-6">
			<IssueNav id={id} />
			{/* On phones the properties sit between the body and the comments. */}
			<div className="grid gap-x-8 gap-y-6 md:grid-cols-[1fr_240px]">
				<article className="grid content-start gap-6 md:col-start-1">
					<Suspense fallback={<IssueBodySkeleton id={id} />}>
						<IssueBody handle={data.issue} />
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
								<IssueStatus handle={data.issue} />
							</Suspense>
						</div>
					</section>
					<Suspense fallback={<AssigneeCardSkeleton />}>
						<AssigneeCard handle={data.assignee} />
					</Suspense>
				</aside>
				<div className="grid gap-6 md:col-start-1">
					<Separator />
					<Suspense fallback={<CommentsSkeleton />}>
						<Comments handle={data.comments} />
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
			<Link
				className={cn(buttonVariants({ size: "sm", variant: "ghost" }))}
				to="/fetch/issues"
			>
				<ArrowLeft /> All issues
			</Link>
			<div className="ml-auto flex gap-1">
				{props.id > 1 ? (
					<Link
						aria-label="Previous issue"
						className={cn(buttonVariants({ size: "icon", variant: "outline" }))}
						params={{ issueId: String(props.id - 1) }}
						title="Previous issue"
						to="/fetch/issues/$issueId"
					>
						<ChevronLeft />
					</Link>
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
				<Link
					aria-label="Next issue"
					className={cn(buttonVariants({ size: "icon", variant: "outline" }))}
					params={{ issueId: String(props.id + 1) }}
					title="Next issue"
					to="/fetch/issues/$issueId"
				>
					<ChevronRight />
				</Link>
			</div>
		</nav>
	);
}

function useIssue(handle: QueryHandleWithData<typeof issueQuery>) {
	const [issue] = useQuery(issueQuery, handle);
	if (!issue) {
		throw notFound();
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
