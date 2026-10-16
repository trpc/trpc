"use client";

import { api, parseResponse } from "~/api.ts";
import type { Issue } from "@examples/db/types";
import { warnMockDbWrite } from "@examples/kit/lib/mock-db-toast";
import { cn } from "@examples/ui/lib/utils";
import { useQueryClient } from "@raf-query/react";
import { useActionState, useOptimistic } from "react";

/**
 * The issue body, editable in place. Blur or Cmd/Ctrl+Enter saves; Escape
 * cancels. Shows the new text while it saves.
 */
export function EditBody(props: { readonly issue: Issue }) {
	const queryClient = useQueryClient();
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
			try {
				await parseResponse(
					api.issues[":id"].$patch({
						json: { body: next },
						param: { id: String(issue.id) },
					}),
				);
			} catch (error) {
				return error instanceof Error ? error.message : String(error);
			}
			await queryClient.invalidate({ queryKey: ["issues"] });
			return null;
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
