import { QueryCache, type QueryHandle, useQuery } from "@raf-query/react";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { Effect, Result } from "effect";
import { Suspense, use } from "react";

import { RenameForm } from "~/components/rename-form.tsx";
import { assigneeQuery, issueQuery } from "~/queries.ts";

const loadIssue = Effect.fn("loadIssue")(
	function* (id: number) {
		const cache = yield* QueryCache.QueryCache;
		return yield* Effect.all(
			{
				assignee: cache.prefetch(assigneeQuery, { issueId: id }),
				issue: cache.ensure(issueQuery, { id }),
			},
			{ concurrency: "unbounded" },
		);
	},
	Effect.catchTag("IssueNotFound", () => Effect.fail(notFound())),
);

// #region services
export const Route = createFileRoute("/issues/$issueId")({
	loader: (args) =>
		args.context.queryClient.runPromise(loadIssue(Number(args.params.issueId))),
	//            ^?
	component: IssuePage,
	errorComponent: (props) => (
		<div role="alert">
			<p>Couldn't load the issue.</p>
			<button onClick={props.reset}>Try again</button>
		</div>
	),
});

function IssuePage() {
	const loaderData = Route.useLoaderData();
	// Loader handled IssueNotFound; throw any other failure to errorComponent.
	const [issue] = useQuery(issueQuery, loaderData.issue, {
		throwOnError: true,
	});
	return (
		<article>
			<h1>{issue.title}</h1>
			<RenameForm issue={issue} />
			<Suspense fallback={<p>Loading assignee…</p>}>
				<Assignee handle={loaderData.assignee} />
			</Suspense>
		</article>
	);
}
// #endregion services

function Assignee(props: { handle: QueryHandle<typeof assigneeQuery> }) {
	const [assigneePromise, controls] = useQuery(assigneeQuery, props.handle);
	const assignee = use(assigneePromise);
	//    ^?
	return Result.match(assignee, {
		onFailure: (error) =>
			error._tag === "IssueNotFound" ? (
				<p>Unassigned</p>
			) : (
				<div role="alert">
					<p>Couldn't load the assignee.</p>
					<button onClick={() => void controls.refetch()}>Try again</button>
				</div>
			),
		onSuccess: (user) => <p>{user.name}</p>,
	});
}
