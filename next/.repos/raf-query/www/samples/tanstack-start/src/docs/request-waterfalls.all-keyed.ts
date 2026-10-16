import { allKeyed, QueryClient, queryOptions } from "@raf-query/react";
import { postQuery } from "~/queries.ts";

const qc = new QueryClient();

declare const slug: string;

declare function getAuthorBySlug(slug: string): Promise<{ name: string }>;

function authorQuery(input: { slug: string }) {
	return queryOptions({
		queryFn: () => getAuthorBySlug(input.slug),
		queryKey: ["author", input.slug],
	});
}

async function load() {
	// #region all-keyed
	return await allKeyed({
		author: qc.ensure(authorQuery, { slug }),
		post: qc.ensure(postQuery, { slug }),
	});
	// #endregion
}
