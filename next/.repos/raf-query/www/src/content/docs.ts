import { queryOptions } from "@raf-query/react";
import { notFound } from "@tanstack/react-router";
import { sections } from "virtual:docs-manifest";

import type { Doc, DocMeta } from "./types.ts";

export { sections };

export const allDocs: ReadonlyArray<DocMeta> = sections.flatMap(
	(section) => section.docs,
);

export const firstDoc = allDocs[0]?.slug ?? "overview";

export function findDoc(slug: string): DocMeta | undefined {
	return allDocs.find((doc) => doc.slug === slug);
}

/** The pages before and after `slug` in sidebar order. */
export function neighbours(slug: string) {
	const index = allDocs.findIndex((doc) => doc.slug === slug);
	return {
		next: index === -1 ? undefined : allDocs[index + 1],
		previous: index <= 0 ? undefined : allDocs[index - 1],
	};
}

// Each page is its own content-hashed chunk: the browser downloads a page
// once per deploy and the CDN can cache it forever.
const pages = import.meta.glob<{ default: Doc }>([
	"/content/*.md",
	"!/content/_*.md",
]);

/**
 * A docs page, compiled at build time. Content only changes with a deploy,
 * so it never goes stale: once a page is loaded (or hovered), going back to
 * it is instant.
 */
export function docQuery(input: { slug: string }) {
	return queryOptions({
		gcTime: Number.POSITIVE_INFINITY,
		queryFn: async () => {
			const load = pages[`/content/${input.slug}.md`];
			if (!load) {
				throw notFound();
			}
			const page = await load();
			return page.default;
		},
		queryKey: ["doc", input.slug],
		staleTime: Number.POSITIVE_INFINITY,
	});
}
