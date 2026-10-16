import { QueryClient, queryOptions } from "@raf-query/react";

import { getPost } from "~/api.ts";

const qc = new QueryClient();

// #region two-parameters
function postPageQuery(slug: string, page: number) {
	return queryOptions({
		queryKey: ["post", slug, page],
		queryFn: () => getPost(slug),
	});
}

// @ts-expect-error -- 2345: a factory takes one input
qc.prefetch(postPageQuery, "hello-world");
// #endregion
