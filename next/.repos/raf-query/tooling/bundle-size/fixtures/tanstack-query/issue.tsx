import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";

import { type Issue, renameIssue } from "../shared/api.ts";
import { issueQuery } from "./queries.ts";

export function IssueTitle(props: { readonly id: number }) {
	const query = useSuspenseQuery(issueQuery({ id: props.id }));
	return (
		<h1 style={{ opacity: query.isFetching ? 0.5 : 1 }}>{query.data.title}</h1>
	);
}

export function EditTitle(props: { readonly issue: Issue }) {
	const queryClient = useQueryClient();
	return (
		<form
			action={async (formData) => {
				const title = String(formData.get("title") ?? "");
				await renameIssue({ id: props.issue.id, title });
				await queryClient.invalidateQueries({
					queryKey: issueQuery({ id: props.issue.id }).queryKey,
				});
			}}
		>
			<input defaultValue={props.issue.title} name="title" />
			<button type="submit">Save</button>
		</form>
	);
}
