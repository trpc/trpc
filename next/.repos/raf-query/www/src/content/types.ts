export interface DocHeading {
	readonly depth: 2 | 3;
	readonly id: string;
	readonly text: string;
}

export type DocSegment =
	| { readonly html: string; readonly kind: "html" }
	| { readonly id: string; readonly kind: "demo" };

/** What every page needs to know about every other: nav, search, SEO. */
export interface DocMeta {
	/** Ids of the demos the page embeds, so its loader can prefetch them. */
	readonly demos: ReadonlyArray<string>;
	readonly description: string;
	readonly headings: ReadonlyArray<DocHeading>;
	/** ISO date of the source file's last commit, when git knows it. */
	readonly lastModified: string | undefined;
	readonly section: string;
	readonly slug: string;
	readonly title: string;
}

export interface Doc extends DocMeta {
	readonly segments: ReadonlyArray<DocSegment>;
}

/** A region of a sample app's file, from a `sample:` import. */
export interface Sample {
	readonly segments: ReadonlyArray<DocSegment>;
}

export interface DocSection {
	readonly docs: ReadonlyArray<DocMeta>;
	readonly title: string;
}
