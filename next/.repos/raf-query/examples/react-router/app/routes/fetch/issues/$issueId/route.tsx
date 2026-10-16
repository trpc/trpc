import { IssueId } from "@examples/db/types";
import { CommentsSkeleton } from "@examples/kit/components/comments";
import {
	IssueBodySkeleton,
	StatusSkeleton,
} from "@examples/kit/components/issue-page";
import { AssigneeCardSkeleton } from "@examples/kit/components/user";
import { Button, buttonVariants } from "@examples/ui/components/button";
import { Separator } from "@examples/ui/components/separator";
import { cn } from "@examples/ui/lib/utils";
import {
	allKeyed,
	dehydrate,
	type QueryHandleWithData,
	useQuery,
} from "@raf-query/react";
import { HydrationBoundary } from "@raf-query/react";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { Suspense } from "react";
import { isRouteErrorResponse } from "react-router";

import { AppLink } from "~/components/app-link.tsx";
import { EditBody } from "~/components/edit-body.tsx";
import { EditTitle } from "~/components/edit-title.tsx";
import { NotFound } from "~/components/not-found.tsx";
import { StatusSelect } from "~/components/status-select.tsx";
import { queryClientContext } from "~/query-client.ts";
import { assigneeQuery, commentsQuery, issueQuery } from "~/queries.ts";
import { withRequest } from "~/settings.ts";

import type { Route } from "./+types/route";
import { AssigneeCard } from "./components/assignee-card.tsx";
import { Comments } from "./components/comments.tsx";

export async function loader(args: Route.LoaderArgs) {
	return withRequest(args.request, async () => {
		const id = Number(args.params.issueId);
		if (!IssueId.safeParse(id).success) {
			throw new Response("Not Found", { status: 404 });
		}
		const queryClient = args.context.get(queryClientContext);
		// `fetch` waits for fresh data: on a cache miss, and when the cached
		// data is stale.
		const handles = await allKeyed({
			assignee: queryClient.fetch(assigneeQuery, { issueId: id }),
			comments: queryClient.fetch(commentsQuery, { issueId: id }),
			issue: queryClient.fetch(issueQuery, { id }),
		});
		if (handles.issue.data === null) {
			throw new Response("Not Found", { status: 404 });
		}
		return {
			assignee: handles.assignee,
			comments: handles.comments,
			dehydratedState: dehydrate(queryClient),
			id,
			issue: handles.issue,
		};
	});
}

export default function IssuePage(props: Route.ComponentProps) {
	const data = props.loaderData;

	return (
		<HydrationBoundary state={data.dehydratedState}>
			{/* Previous and next stay on this route, so a new id mounts a fresh page. */}
			<div className="grid gap-6" key={data.id}>
				<IssueNav id={data.id} />
				<div className="grid gap-x-8 gap-y-6 md:grid-cols-[1fr_240px]">
					<article className="grid content-start gap-6 md:col-start-1">
						<Suspense fallback={<IssueBodySkeleton id={data.id} />}>
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
		</HydrationBoundary>
	);
}

/** A missing issue shows the not-found page; other errors go to the root's. */
export function ErrorBoundary(props: Route.ErrorBoundaryProps) {
	if (
		props.error === issueNotFound ||
		(isRouteErrorResponse(props.error) && props.error.status === 404)
	) {
		return <NotFound />;
	}
	throw props.error;
}

function IssueNav(props: { readonly id: number }) {
	return (
		<nav className="flex items-center gap-2">
			<AppLink
				className={cn(buttonVariants({ size: "sm", variant: "ghost" }))}
				to="/fetch/issues"
			>
				<ArrowLeft /> All issues
			</AppLink>
			<div className="ml-auto flex gap-1">
				{props.id > 1 ? (
					<AppLink
						aria-label="Previous issue"
						className={cn(buttonVariants({ size: "icon", variant: "outline" }))}
						title="Previous issue"
						to={`/fetch/issues/${props.id - 1}`}
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
					title="Next issue"
					to={`/fetch/issues/${props.id + 1}`}
				>
					<ChevronRight />
				</AppLink>
			</div>
		</nav>
	);
}

/**
 * What `useIssue` throws for a missing issue. Thrown while rendering, it reaches
 * the error boundary as is, not as the route error response a loader's thrown
 * Response becomes, so the boundary looks for this one.
 */
const issueNotFound = new Response("Not Found", { status: 404 });

function useIssue(handle: QueryHandleWithData<typeof issueQuery>) {
	const [issue] = useQuery(issueQuery, handle);
	if (!issue) {
		throw issueNotFound;
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
