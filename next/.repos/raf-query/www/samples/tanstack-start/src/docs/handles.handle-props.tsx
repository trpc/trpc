import { commentsQuery, postQuery } from "~/queries.ts";

// #region handle-props
import type { QueryHandle, QueryHandleWithData } from "@raf-query/react";

// Fed by `prefetch`: `useQuery` returns a promise.
function Comments(props: { handle: QueryHandle<typeof commentsQuery> }) {
	// ...
}

// Fed by `ensure` or `fetch`: `useQuery` returns the data.
function Post(props: { handle: QueryHandleWithData<typeof postQuery> }) {
	// ...
}
// #endregion
