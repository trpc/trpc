import { QueryCache, QueryClient } from "@raf-query/react";
import { Effect } from "effect";
import { IssueApi, IssueApiLive } from "~/issues.ts";

const queryClient = new QueryClient({ layer: IssueApiLive });

// #region run-promise
await queryClient.runPromise(
	Effect.gen(function* () {
		const api = yield* IssueApi;
		const cache = yield* QueryCache.QueryCache;
		yield* api.rename({ id: 1, title: "Renamed" });
		yield* cache.invalidate({ queryKey: ["issue", 1] });
	}),
);
// #endregion
