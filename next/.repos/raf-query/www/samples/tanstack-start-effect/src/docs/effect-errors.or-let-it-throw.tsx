import { type QueryHandleWithData, useQuery } from "@raf-query/react";
import { Schema } from "effect";
import { Unauthorized } from "~/issues.ts";
import { issueQuery } from "~/queries.ts";

// #region or-let-it-throw
function IssueTitle(props: { handle: QueryHandleWithData<typeof issueQuery> }) {
	const [issue, controls] = useQuery(issueQuery, props.handle, {
		throwOnError: true,
	});
	return (
		<header>
			<h1>{issue.title}</h1>
			{Schema.is(Unauthorized)(controls.error) ? (
				<p role="status">Signed out. Showing the last copy.</p>
			) : null}
		</header>
	);
}
// #endregion
