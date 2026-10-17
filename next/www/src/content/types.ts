export interface DocHeading {
  readonly depth: 2 | 3;
  readonly id: string;
  readonly text: string;
}

/** What every page needs to know about every other: nav, search, SEO. */
export interface DocMeta {
  readonly description: string;
  readonly headings: ReadonlyArray<DocHeading>;
  /** The page's name in the sidebar, where it's shorter than its title. */
  readonly label?: string | undefined;
  /** ISO date of the source file's last commit, when git knows it. */
  readonly lastModified: string | undefined;
  readonly section: string;
  /** The page's path under `docs/`, without `.md`: `client/links`. */
  readonly slug: string;
  readonly title: string;
  /** The slug of the v11 page on the same topic, if there is one. */
  readonly v11?: string | undefined;
}

export interface Doc extends DocMeta {
  /** The page, highlighted and compiled at build time. */
  readonly html: string;
}

/** A region of a sample app's file, from a `sample:` import. */
export interface Sample {
  readonly html: string;
}

export interface DocSection {
  readonly docs: ReadonlyArray<DocMeta>;
  readonly title: string;
}
