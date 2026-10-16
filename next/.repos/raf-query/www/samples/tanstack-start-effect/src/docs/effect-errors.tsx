import { type QueryHandle, useQuery } from "@raf-query/react";
import { Result } from "effect";
import { Suspense, use } from "react";
import { assigneeQuery } from "~/queries.ts";
import { QueryCache } from "@raf-query/react";
import { Effect } from "effect";
import { getRouteApi } from "@tanstack/react-router";
import { useActionState } from "react";
import { type Issue, IssueApi } from "~/issues.ts";

// #region in-react
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

function AssigneeSection(props: { handle: QueryHandle<typeof assigneeQuery> }) {
	return (
		<Suspense fallback={<p>Loading assignee…</p>}>
			<Assignee handle={props.handle} />
		</Suspense>
	);
}
// #endregion

const Route = getRouteApi("/issues/$issueId");

// #region catch-it-where-you-call
const rename = Effect.fn("rename")(
	function* (input: { readonly id: number; readonly title: string }) {
		const api = yield* IssueApi;
		const cache = yield* QueryCache.QueryCache;
		yield* api.rename(input);
		yield* cache.invalidate({ queryKey: ["issue", input.id] });
		return null;
	},
	Effect.catchTags({
		EmptyTitle: () => Effect.succeed("Title can't be empty"),
		Unauthorized: () => Effect.succeed("Sign in to rename issues"),
	}),
);

const renaming = rename({ id: 1, title: "" });
//    ^?

export function RenameForm(props: { issue: Issue }) {
	const queryClient = Route.useRouteContext().queryClient;
	const [message, action, isPending] = useActionState(
		(_previous: string | null, formData: FormData) =>
			queryClient.runPromise(
				rename({ id: props.issue.id, title: String(formData.get("title")) }),
			),
		null,
	);
	return (
		<form action={action}>
			<input defaultValue={props.issue.title} name="title" />
			<button disabled={isPending}>Rename</button>
			{message === null ? null : <p role="alert">{message}</p>}
		</form>
	);
}
// #endregion
