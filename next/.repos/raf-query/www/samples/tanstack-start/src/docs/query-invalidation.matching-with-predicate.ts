import { Query, QueryClient } from "@raf-query/react";

const qc = new QueryClient();

// #region matching-with-predicate
// Every todo list on page 2 or later
await qc.invalidate({
	predicate: (query) =>
		query.key[0] === "todos" &&
		typeof (query.handle.input as { page?: unknown } | undefined)?.page ===
			"number" &&
		(query.handle.input as { page: number }).page >= 2,
});

// Everything not being read
qc.remove({ predicate: (query) => Query.observerCountUnsafe(query) === 0 });
// #endregion
