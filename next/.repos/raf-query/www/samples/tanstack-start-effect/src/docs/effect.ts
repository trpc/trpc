import { queryOptions } from "@raf-query/react";
import { Effect, Schedule } from "effect";
import { IssueApi } from "~/issues.ts";

// #region effect-queryfns
export function issueQuery(input: { id: number }) {
	return queryOptions({
		queryKey: ["issue", input.id],
		queryFn: () => IssueApi.use((api) => api.get(input.id)),
		retry: Schedule.exponential("200 millis").pipe(Schedule.upTo({ times: 3 })),
	});
}
// #endregion
