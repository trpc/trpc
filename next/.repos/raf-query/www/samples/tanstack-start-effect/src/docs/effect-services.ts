import { QueryCache, queryOptions } from "@raf-query/core";
import { Context, Effect, Layer } from "effect";
import type { Issue, IssueNotFound } from "~/issues.ts";

declare const IssueRepo: {
	get(id: number): Effect.Effect<Issue, IssueNotFound>;
};

// #region intro
class IssueApi extends Context.Service<
	IssueApi,
	{ readonly get: (id: number) => Effect.Effect<Issue, IssueNotFound> }
>()("app/IssueApi") {}

const IssueApiLive = Layer.succeed(IssueApi, { get: IssueRepo.get });

export function issueQuery(input: { id: number }) {
	return queryOptions({
		queryKey: ["issue", input.id],
		queryFn: () => IssueApi.use((api) => api.get(input.id)),
	});
}

// Effect<Issue, IssueNotFound | Query.CancelledError, QueryCache | IssueApi>
const issue = QueryCache.QueryCache.use((cache) =>
	cache.fetch(issueQuery, { id: 1 }),
);

Effect.runFork(
	issue.pipe(Effect.provide(QueryCache.layer()), Effect.provide(IssueApiLive)),
);
// #endregion
