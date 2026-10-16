import { queryOptions, type QueryClientConfig } from "@raf-query/react";

declare global {
	/** Each `queryFn` call, by key. The RSC and SSR builds share it. */
	var queryFnCalls: Array<string> | undefined;
}

function record(key: string) {
	globalThis.queryFnCalls ??= [];
	globalThis.queryFnCalls.push(key);
}

export const queryClientConfig = {
	defaults: { staleTime: 5000 },
} as const satisfies QueryClientConfig;

export function postQuery(input: { slug: string }) {
	return queryOptions({
		queryFn: async () => {
			record(`post ${input.slug}`);
			return { title: `Post ${input.slug}` };
		},
		queryKey: ["post", input.slug],
	});
}

export function commentsQuery(input: { slug: string }) {
	return queryOptions({
		queryFn: async () => {
			record(`comments ${input.slug}`);
			// Still pending when the page renders, so it streams.
			await new Promise((resolve) => setTimeout(resolve, 20));
			return [`First comment on ${input.slug}`];
		},
		queryKey: ["comments", input.slug],
	});
}
