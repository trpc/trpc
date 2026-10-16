import { type QueryHandle, useQuery, useQueryClient } from "@raf-query/react";
import { use } from "react";

import { type Issue, renameIssue } from "../shared/api.ts";
import { issueQuery } from "./queries.ts";

export function IssueTitle(props: {
	readonly handle: QueryHandle<typeof issueQuery>;
}) {
	const [issuePromise, controls] = useQuery(issueQuery, props.handle);
	const issue = use(issuePromise);
	return (
		<h1 style={{ opacity: controls.isFetching ? 0.5 : 1 }}>{issue.title}</h1>
	);
}

export function EditTitle(props: { readonly issue: Issue }) {
	const queryClient = useQueryClient();
	return (
		<form
			action={async (formData) => {
				const title = String(formData.get("title") ?? "");
				await renameIssue({ id: props.issue.id, title });
				await queryClient.invalidate(issueQuery, { id: props.issue.id });
			}}
		>
			<input defaultValue={props.issue.title} name="title" />
			<button type="submit">Save</button>
		</form>
	);
}
