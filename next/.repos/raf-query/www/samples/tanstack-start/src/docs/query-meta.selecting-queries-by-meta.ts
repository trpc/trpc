import { Query, QueryClient } from "@raf-query/react";

const qc = new QueryClient();

// #region selecting-queries-by-meta
await qc.invalidate({
	predicate: (query) => Query.metaUnsafe(query)?.scope === "billing",
});
// #endregion
