import { type ErrorOf, QueryCache, queryOptions } from "@raf-query/react";
import { Effect } from "effect";
import { IssueApi } from "~/issues.ts";

// #region inferred-from-the-queryfn
export function issueQuery(input: { id: number }) {
	return queryOptions({
		queryKey: ["issue", input.id],
		queryFn: () => IssueApi.use((api) => api.get(input.id)),
	});
}

type IssueError = ErrorOf<typeof issueQuery>;
//   ^?

const issue = Effect.gen(function* () {
	const cache = yield* QueryCache.QueryCache;
	return yield* cache.fetch(issueQuery, { id: 1 });
});
issue;
// ^?
// #endregion
