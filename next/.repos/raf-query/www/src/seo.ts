import { site } from "./site.ts";

type JsonValue =
	| boolean
	| JsonObject
	| null
	| number
	| ReadonlyArray<JsonValue>
	| string;

/** A Schema.org JSON-LD node. */
interface JsonObject {
	readonly [key: string]: JsonValue | undefined;
}

export interface PageSeo {
	readonly description: string;
	/** The page as markdown, for agents: `/docs/<slug>.md`. */
	readonly markdownPath: string;
	/** Path from the site root, starting with `/`. */
	readonly path: string;
	/** Schema.org JSON-LD objects for the page. */
	readonly structuredData?: ReadonlyArray<JsonObject>;
	/** Page title, without the site name. Omit for the home page. */
	readonly title?: string;
	readonly type?: "article" | "website";
}

export function absoluteUrl(path: string) {
	return new URL(path, site.url).href;
}

/** `head()` for a route: title, description, canonical URL, social cards and JSON-LD. */
export function pageHead(page: PageSeo) {
	const title = page.title
		? `${page.title} | ${site.name}`
		: `${site.name}: ${site.tagline}`;
	const url = absoluteUrl(page.path);
	const image = absoluteUrl("/og.png");
	return {
		links: [
			{ href: url, rel: "canonical" },
			{
				href: page.markdownPath,
				rel: "alternate",
				title: "Markdown",
				type: "text/markdown",
			},
		],
		meta: [
			{ title },
			{ content: page.description, name: "description" },
			{ content: title, property: "og:title" },
			{ content: page.description, property: "og:description" },
			{ content: url, property: "og:url" },
			{ content: page.type ?? "website", property: "og:type" },
			{ content: site.name, property: "og:site_name" },
			{ content: image, property: "og:image" },
			{ content: "1200", property: "og:image:width" },
			{ content: "630", property: "og:image:height" },
			{ content: `${site.name}: ${site.tagline}`, property: "og:image:alt" },
			{ content: "summary_large_image", name: "twitter:card" },
			{ content: title, name: "twitter:title" },
			{ content: page.description, name: "twitter:description" },
			{ content: image, name: "twitter:image" },
		],
		scripts: (page.structuredData ?? []).map((data) => ({
			children: JSON.stringify({ "@context": "https://schema.org", ...data }),
			type: "application/ld+json",
		})),
	};
}
