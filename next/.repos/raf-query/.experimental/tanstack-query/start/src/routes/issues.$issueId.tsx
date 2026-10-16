import { Button, buttonVariants } from "@examples/ui/components/button";
import { cn } from "@examples/ui/lib/utils";
import { Separator } from "@examples/ui/components/separator";
import {
	ensure,
	prefetch,
	useQuery,
} from "@raf-query/experimental-tanstack-react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { Suspense, use } from "react";

import { Comments, CommentsSkeleton } from "~/components/comments.tsx";
import { EditTitle } from "~/components/edit-title.tsx";
import { StatusBadge } from "~/components/status-badge.tsx";
import { AssigneeCard, AssigneeCardSkeleton } from "~/components/user.tsx";
import { assigneeQuery, commentsQuery, issueQuery } from "~/queries.ts";

export const Route = createFileRoute("/issues/$issueId")({
	loader: async (args) => {
		const qc = args.context.queryClient;
		const id = Number(args.params.issueId);
		return {
			assignee: prefetch(qc, assigneeQuery, { issueId: id }),
			comments: prefetch(qc, commentsQuery, { issueId: id }),
			issue: await ensure(qc, issueQuery, { id }),
		};
	},
	component: IssuePage,
});

function IssuePage() {
	const data = Route.useLoaderData();
	const [issuePromise] = useQuery(issueQuery, data.issue);
	const issue = use(issuePromise);

	return (
		<div className="grid gap-6">
			<nav className="flex items-center gap-2">
				<Link
					className={cn(buttonVariants({ size: "sm", variant: "ghost" }))}
					to="/issues"
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
							params={{ issueId: String(issue.id - 1) }}
							to="/issues/$issueId"
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
						params={{ issueId: String(issue.id + 1) }}
						to="/issues/$issueId"
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
						<Comments handle={data.comments} />
					</Suspense>
				</article>
				<aside>
					<Suspense fallback={<AssigneeCardSkeleton />}>
						<AssigneeCard handle={data.assignee} />
					</Suspense>
				</aside>
			</div>
		</div>
	);
}
