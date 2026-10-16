import { getRouteApi } from "@tanstack/react-router";
import { Effect } from "effect";
import { type Issue, IssueApi } from "~/issues.ts";

const Route = getRouteApi("/issues/$issueId");

// #region in-react
export function RenameForm(props: { issue: Issue }) {
	const queryClient = Route.useRouteContext().queryClient; // not useQueryClient()
	return (
		<form
			action={(formData) =>
				queryClient.runPromise(
					IssueApi.use((api) =>
						api.rename({
							id: props.issue.id,
							title: String(formData.get("title")),
						}),
					).pipe(Effect.ignore),
				)
			}
		>
			<input defaultValue={props.issue.title} name="title" />
		</form>
	);
}
// #endregion
