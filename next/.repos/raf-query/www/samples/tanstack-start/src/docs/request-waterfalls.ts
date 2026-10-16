import { QueryClient } from "@raf-query/react";
import { commentsQuery, postQuery } from "~/queries.ts";

const qc = new QueryClient();

declare const slug: string;

// #region start-every-query-before-awaiting-any
{
	// ❌ comments wait for the post
	const post = await qc.ensure(postQuery, { slug });
	const comments = qc.prefetch(commentsQuery, { slug });
}

{
	// ✅ both start together
	const comments = qc.prefetch(commentsQuery, { slug });
	const post = await qc.ensure(postQuery, { slug });
}
// #endregion
