import { Effect } from "effect";
import { issueQuery } from "~/queries.ts";

// #region entries-and-observers
import { Query, QueryCache } from "@raf-query/core";

const program = Effect.gen(function* () {
	const cache = yield* QueryCache.QueryCache;
	const query = yield* cache.getQuery(issueQuery, { id: 1 });
	yield* Query.fetch(query);
	yield* Query.invalidate(query);
	return Query.getUnsafe(query); // synchronous read
});
// #endregion
