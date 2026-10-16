import { QueryCache } from "@raf-query/react";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { Effect } from "effect";

import { issueQuery } from "~/queries.ts";

// #region catch-it-where-you-call
const loadIssue = Effect.fn("loadIssue")(
	function* (id: number) {
		const cache = yield* QueryCache.QueryCache;
		return { issue: yield* cache.ensure(issueQuery, { id }) };
	},
	Effect.catchTag("IssueNotFound", () => Effect.fail(notFound())),
);

export const Route = createFileRoute("/issues/$issueId")({
	loader: (args) =>
		args.context.queryClient.runPromise(loadIssue(Number(args.params.issueId))),
	errorComponent: (props) => (
		<div role="alert">
			<p>Couldn't load the issue.</p>
			<button onClick={props.reset}>Try again</button>
		</div>
	),
});
// #endregion
