import { type QueryHandle, useQuery } from "@raf-query/react";
import { buildQuery } from "~/queries.ts";

// #region intro
function BuildStatus(props: { handle: QueryHandle<typeof buildQuery> }) {
	const [buildPromise, build] = useQuery(buildQuery, props.handle, {
		refetchInterval: 2000,
	});
	// ...
}
// #endregion

declare const props: { handle: QueryHandle<typeof buildQuery> };

declare const buildState: "pending" | "running" | "done" | "failed";

// #region changing-the-interval
const [buildPromise, build] = useQuery(buildQuery, props.handle, {
	refetchInterval: buildState === "running" ? 1000 : undefined,
});
// #endregion
