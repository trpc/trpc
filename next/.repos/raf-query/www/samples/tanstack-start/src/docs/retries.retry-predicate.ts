import { queryOptions } from "@raf-query/react";
import { getPost, HttpError } from "~/api.ts";

// #region retry-predicate
queryOptions({
	queryKey: ["post", "hello"],
	queryFn: () => getPost("hello"),
	retry: (failureCount, error) =>
		failureCount <= 3 && !(error instanceof HttpError && error.status === 404),
});
// #endregion
