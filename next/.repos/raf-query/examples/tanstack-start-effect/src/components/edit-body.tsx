import { warnMockDbWrite } from "@examples/kit/lib/mock-db-toast";
import { cn } from "@examples/ui/lib/utils";
import { useRouteContext } from "@tanstack/react-router";
import { Effect } from "effect";
import { useActionState, useOptimistic } from "react";

import { Issues } from "~/issues.ts";
import { invalidateIssues } from "~/queries.ts";
import type { Issue } from "~/rpc.ts";

/** Saves the body, then waits for the refetched issue. `null` when it saved. */
const saveBody = Effect.fn("saveBody")(
	function* (input: { readonly body: string; readonly id: number }) {
		const issues = yield* Issues;
		yield* issues.UpdateBody(input);
		yield* invalidateIssues;
		return null;
	},
	Effect.catchTags({
		// Every failure `UpdateBody` declares, so this Effect can't fail.
		EmptyBody: () => Effect.succeed("Description can't be empty"),
		RpcClientError: (error) => Effect.succeed(error.message),
	}),
);

/**
 * The issue body, editable in place. Blur or Cmd/Ctrl+Enter saves; Escape
 * cancels. Shows the new text while it saves.
 */
export function EditBody(props: { readonly issue: Issue }) {
	const queryClient = useRouteContext({
		from: "__root__",
		select: (context) => context.queryClient,
	});
	const issue = props.issue;
	const [body, setOptimisticBody] = useOptimistic(issue.body);
	const [saveError, save, isSaving] = useActionState<string | null, FormData>(
		async (_previous, formData) => {
			const next = String(formData.get("body") ?? "").trim();
			if (next === issue.body) {
				return null;
			}
			if (next === "") {
				return "Description can't be empty";
			}
			warnMockDbWrite();
			setOptimisticBody(next);
			return queryClient.runPromise(saveBody({ body: next, id: issue.id }));
		},
		null,
	);

	return (
		<form action={save} className="grid gap-1">
			<textarea
				aria-label="Description"
				className={cn(
					"min-h-28 w-full resize-y rounded-md bg-transparent px-1.5 py-1 text-sm whitespace-pre-line outline-none",
					"-mx-1.5 transition-[box-shadow,background-color]",
					"hover:bg-muted/60 focus:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring/50",
					isSaving && "opacity-70",
				)}
				defaultValue={body}
				disabled={isSaving}
				key={body}
				name="body"
				onBlur={(event) => {
					if (event.currentTarget.value.trim() === issue.body) {
						return;
					}
					event.currentTarget.form?.requestSubmit();
				}}
				onKeyDown={(event) => {
					if (event.key === "Escape") {
						event.currentTarget.value = issue.body;
						event.currentTarget.blur();
					}
					if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
						event.preventDefault();
						event.currentTarget.blur();
					}
				}}
				rows={5}
			/>
			{saveError === null ? null : (
				<p className="text-sm text-destructive">{saveError}</p>
			)}
		</form>
	);
}
