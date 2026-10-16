import type { QueryClient } from "@raf-query/react";
import { createFileRoute } from "@tanstack/react-router";

import { commentsQuery, postQuery } from "~/queries.ts";

export async function postLoader(args: {
	context: { queryClient: QueryClient };
	params: { slug: string };
}) {
	const qc = args.context.queryClient;
	const comments = qc.prefetch(commentsQuery, { slug: args.params.slug });
	const post = await qc.ensure(postQuery, { slug: args.params.slug });
	return { comments, post };
}

export const Route = createFileRoute("/posts/$slug")({ loader: postLoader });
