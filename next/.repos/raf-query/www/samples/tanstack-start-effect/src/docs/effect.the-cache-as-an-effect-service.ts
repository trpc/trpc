import { Effect } from "effect";
import { IssueApiLive } from "~/issues.ts";
import { issueQuery } from "~/queries.ts";

// #region the-cache-as-an-effect-service
import { QueryCache } from "@raf-query/core";
import { Stream } from "effect";

const program = Effect.gen(function* () {
	const cache = yield* QueryCache.QueryCache;
	const issue = yield* cache.fetch(issueQuery, { id: 1 });
	yield* cache.watch(issueQuery, { id: 1 }).pipe(
		Stream.map((state) => state.data?.title),
		Stream.runForEach((title) => Effect.log(title)),
	);
});

Effect.runFork(
	program.pipe(
		Effect.provide(QueryCache.layer()),
		Effect.provide(IssueApiLive),
	),
);
// #endregion
