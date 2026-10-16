import { Button } from "@examples/ui/components/button";
import { Skeleton } from "@examples/ui/components/skeleton";
import { type QueryHandle, queryOptions, useQuery } from "@raf-query/react";
import {
	CatchBoundary,
	type ErrorComponentProps,
} from "@tanstack/react-router";
import { RefreshCw } from "lucide-react";
import { startTransition, Suspense, use } from "react";

import { DemoBrowser, DemoLink } from "~/demo-kit/browser.tsx";
import { FailNextButton, formatTime, Spinner } from "~/demo-kit/controls.tsx";
import { defineDemo } from "~/demo-kit/define.ts";
import { seedPosts } from "~/demo-kit/fixtures.ts";
import { createFakeServer } from "~/demo-kit/server.ts";

const server = createFakeServer(() => ({ posts: seedPosts() }));

function postQuery(input: { readonly id: number }) {
	return queryOptions({
		queryFn: (context) =>
			server.respond(
				`GET /posts/${input.id}`,
				(db) => db.posts.find((post) => post.id === input.id),
				context,
			),
		queryKey: ["posts", input.id],
		retry: 2,
		retryDelay: (failureCount) => 500 * 2 ** (failureCount - 1),
	});
}

type PageData =
	| { readonly page: "list" }
	| { readonly page: "post"; readonly post: QueryHandle<typeof postQuery> };

function PostSkeleton() {
	return (
		<div className="grid gap-2">
			<Skeleton className="h-6 w-2/3" />
			<Skeleton className="h-4 w-full" />
		</div>
	);
}

/**
 * Reads and unwraps the query in one component, so the render that throws a
 * failed first load to the boundary is a read of the query: resetting the
 * boundary then refetches it.
 */
function PostView(props: { readonly handle: QueryHandle<typeof postQuery> }) {
	const [postPromise, post] = useQuery(postQuery, props.handle);
	const data = use(postPromise);
	return (
		<div className="grid gap-3">
			<div className="grid gap-1">
				<h3 className="text-lg font-semibold">{data?.title}</h3>
				<p className="text-sm text-muted-foreground">{data?.body}</p>
			</div>
			<div className="flex flex-wrap items-center gap-2">
				<Button
					disabled={post.isFetching}
					onClick={() => {
						startTransition(async () => {
							await post.refetch();
						});
					}}
					size="xs"
					variant="outline"
				>
					<RefreshCw /> Refetch
				</Button>
				{post.isFetching ? (
					<span className="flex items-center gap-1.5 text-xs text-muted-foreground">
						<Spinner /> fetching
					</span>
				) : null}
			</div>
			{post.error && !post.isFetching ? (
				<p
					className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs"
					role="status"
				>
					Couldn&apos;t refresh (
					{post.error instanceof Error ? post.error.message : "unknown error"}).
					Still showing the post from {formatTime(post.updatedAt)}.
				</p>
			) : null}
		</div>
	);
}

// oxlint-disable-next-line workspace/inline-jsx-callback -- a component; defined inline it would remount on every render
function PostError(props: ErrorComponentProps) {
	return (
		<div
			className="grid justify-items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm"
			role="alert"
		>
			<p>
				Couldn&apos;t load the post:{" "}
				{props.error instanceof Error ? props.error.message : "unknown error"}
			</p>
			<Button onClick={props.reset} size="xs" variant="outline">
				Try again
			</Button>
		</div>
	);
}

function Page(props: { readonly data: PageData }) {
	const data = props.data;
	if (data.page === "list") {
		return (
			<ul className="grid gap-1">
				{seedPosts()
					.slice(0, 4)
					.map((post) => (
						<li key={post.id}>
							<DemoLink
								className="block rounded-md px-2 py-1.5 text-sm hover:bg-accent"
								to={{ path: `/posts/${post.id}` }}
							>
								{post.title}
							</DemoLink>
						</li>
					))}
			</ul>
		);
	}
	return (
		<div className="grid gap-4">
			<DemoLink
				className="text-xs text-muted-foreground hover:text-foreground"
				to={{ path: "/posts" }}
			>
				← All posts
			</DemoLink>
			<CatchBoundary
				errorComponent={PostError}
				getResetKey={() => data.post.key.join("/")}
			>
				<Suspense fallback={<PostSkeleton />}>
					<PostView handle={data.post} />
				</Suspense>
			</CatchBoundary>
		</div>
	);
}

function Retries() {
	return (
		<div className="grid gap-3">
			<div className="flex flex-wrap gap-2">
				<FailNextButton server={server} />
				<FailNextButton count={3} server={server} />
			</div>
			<DemoBrowser
				fallback={<Skeleton className="h-24 w-full" />}
				initial={{ path: "/posts" }}
				loader={(args): PageData => {
					const id = Number(args.location.path.split("/")[2]);
					return id
						? { page: "post", post: args.client.prefetch(postQuery, { id }) }
						: { page: "list" };
				}}
			>
				{(route) => <Page data={route.data} />}
			</DemoBrowser>
		</div>
	);
}

export default defineDemo({
	Component: Retries,
	hint: "Queries here retry twice. Fail one request and open a post: the retry recovers it. Fail three to exhaust the retries: a first load hits the error boundary, a refetch keeps the old data.",
	server,
	title: "Retries and error boundaries",
});
