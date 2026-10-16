"use client";

import { api, parseResponse } from "~/api.ts";
import type { Issue } from "@examples/db/types";
import { warnMockDbWrite } from "@examples/kit/lib/mock-db-toast";
import { cn } from "@examples/ui/lib/utils";
import { useQueryClient } from "@raf-query/react";
import { useActionState, useOptimistic } from "react";

/**
 * The issue title, editable in place. Click (or tab) into it, then Enter or
 * blur to save; Escape cancels. Shows the new title while it saves.
 */
export function EditTitle(props: { readonly issue: Issue }) {
	const queryClient = useQueryClient();
	const issue = props.issue;
	const [title, setOptimisticTitle] = useOptimistic(issue.title);
	const [saveError, save, isSaving] = useActionState<string | null, FormData>(
		async (_previous, formData) => {
			const next = String(formData.get("title") ?? "").trim();
			if (next === issue.title) {
				return null;
			}
			if (next === "") {
				return "Title can't be empty";
			}
			warnMockDbWrite();
			setOptimisticTitle(next);
			try {
				await parseResponse(
					api.issues[":id"].$patch({
						json: { title: next },
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
			<div className="flex items-baseline gap-2">
				{/* `w-0`: the input's own width must not set the page's minimum width on phones. */}
				<input
					aria-label="Title"
					className={cn(
						"w-0 flex-1 rounded-md bg-transparent px-1.5 py-0.5 text-2xl font-semibold tracking-tight outline-none",
						"-mx-1.5 transition-[box-shadow,background-color]",
						"hover:bg-muted/60 focus:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring/50",
						isSaving && "opacity-70",
					)}
					defaultValue={title}
					disabled={isSaving}
					key={title}
					name="title"
					onBlur={(event) => {
						if (event.currentTarget.value.trim() === issue.title) {
							return;
						}
						event.currentTarget.form?.requestSubmit();
					}}
					onKeyDown={(event) => {
						if (event.key === "Enter") {
							event.preventDefault();
							event.currentTarget.blur();
						}
						if (event.key === "Escape") {
							event.currentTarget.value = issue.title;
							event.currentTarget.blur();
						}
					}}
				/>
				<span className="shrink-0 text-lg text-muted-foreground">
					#{issue.id}
				</span>
			</div>
			{saveError === null ? null : (
				<p className="text-sm text-destructive">{saveError}</p>
			)}
		</form>
	);
}
