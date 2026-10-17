// #region load
import {
	allKeyed,
	dehydrate,
	QueryClient,
} from "@raf-query/experimental-svelte";

import { commentsQuery, postQuery } from "#lib/queries.ts";

import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ params }) => {
	const qc = new QueryClient();
	const input = { slug: params.slug };
	const handles = await allKeyed({
		comments: qc.ensure(commentsQuery, input),
		post: qc.ensure(postQuery, input),
	});
	return { ...handles, queries: dehydrate(qc) };
};
// #endregion load
