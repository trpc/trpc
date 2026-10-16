import { QueryCache } from "@raf-query/react";
import { getRouteApi } from "@tanstack/react-router";
import { Effect } from "effect";
import { useActionState } from "react";

import { type Issue, IssueApi } from "~/issues.ts";

const Route = getRouteApi("/issues/$issueId");

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
