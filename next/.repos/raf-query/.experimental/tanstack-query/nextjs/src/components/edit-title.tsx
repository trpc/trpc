"use client";

import { api, parseResponse } from "@examples/api/client";
import type { Issue } from "@examples/db/types";
import { Button } from "@examples/ui/components/button";
import { Input } from "@examples/ui/components/input";
import { useQueryClient } from "@raf-query/experimental-tanstack-react-query";
import { useActionState, useOptimistic } from "react";

/** The issue's title, editable in place. Shows the new title while it saves. */
export function EditTitle(props: { readonly issue: Issue }) {
	const queryClient = useQueryClient();
	const issue = props.issue;
	const [title, setOptimisticTitle] = useOptimistic(issue.title);
	const [saveError, save, isSaving] = useActionState<string | null, FormData>(
		async (_previous, formData) => {
			const next = String(formData.get("title") ?? "");
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
			await queryClient.invalidateQueries({ queryKey: ["issues"] });
			return null;
		},
		null,
	);

	return (
		<div className="grid gap-3">
			<h1 className="text-2xl font-semibold">
				{title} <span className="text-muted-foreground">#{issue.id}</span>
			</h1>
			<form action={save} className="flex gap-2">
				<Input
					aria-label="Title"
					defaultValue={issue.title}
					key={issue.title}
					name="title"
				/>
				<Button disabled={isSaving} type="submit" variant="secondary">
					{isSaving ? "Saving…" : "Rename"}
				</Button>
			</form>
			{saveError === null ? null : (
				<p className="text-sm text-destructive">{saveError}</p>
			)}
		</div>
	);
}
