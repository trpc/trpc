import { IssueListInput } from "~/issue-list-input.ts";
import { issueListQuery } from "~/queries.ts";
import { getQueryClient } from "~/query-client.ts";

// #region page
export default async function IssuesPage(props: {
	searchParams: Promise<Record<string, string | Array<string>>>;
}) {
	const input = IssueListInput.parse(await props.searchParams);
	const qc = getQueryClient();
	const issues = qc.prefetch(issueListQuery, input);
	// ...
	// #endregion
	void issues;
	return null;
}
