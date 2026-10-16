import { allKeyed, type QueryClient } from "@raf-query/react";
import { authorQuery, postQuery } from "~/queries.ts";

declare const qc: QueryClient;

declare const slug: string;

async function load() {
	// #region awaiting-several-queries
	return await allKeyed({
		post: qc.ensure(postQuery, { slug }),
		author: qc.ensure(authorQuery, { id: slug }),
	});
	// #endregion
}
