import type { ExperimentId } from '../experiments.ts';

export interface DocHeading {
  readonly depth: 2 | 3;
  readonly id: string;
  readonly text: string;
}

/** What every page needs to know about every other: nav, search, SEO. */
export interface DocMeta {
  readonly description: string;
  /**
   * The experiment (`src/experiments.ts`) the page belongs to: out of the
   * sidebar and pagination until it's on, `noindex` and out of the sitemap;
   * still served at its URL, found by the site's search and in `llms.txt`.
   */
  readonly experiment?: ExperimentId | undefined;
  readonly headings: ReadonlyArray<DocHeading>;
  /** The page's name in the sidebar, where it's shorter than its title. */
  readonly label?: string | undefined;
  /** ISO date of the source file's last commit, when git knows it. */
  readonly lastModified: string | undefined;
  /** The slug of the page it nests under in the sidebar. */
  readonly parent?: string | undefined;
  readonly section: string;
  /** The page's path under `docs/`, without `.md`: `client/links`. */
  readonly slug: string;
  /** `unstable` when the page is about `unstable_` exports: badged, but listed. */
  readonly stability?: 'unstable' | undefined;
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

export interface PostAuthor {
  /** Their avatar's URL. */
  readonly image?: string | undefined;
  readonly name: string;
  readonly title?: string | undefined;
  readonly url?: string | undefined;
}

/** What the blog's index and each post need to know about every post. */
export interface PostMeta {
  readonly authors: ReadonlyArray<PostAuthor>;
  /** When it was published: `2025-03-21`. */
  readonly date: string;
  /** Its first paragraph, as text. */
  readonly description: string;
  /** The GitHub discussion that holds its comments. */
  readonly discussion?: number | undefined;
  readonly readingMinutes: number;
  /** Its path under `/blog`: `announcing-trpc-v11`. */
  readonly slug: string;
  readonly title: string;
}

export interface Post extends PostMeta {
  readonly headings: ReadonlyArray<DocHeading>;
  /** The post, highlighted and compiled at build time. */
  readonly html: string;
}

export interface DocSection {
  readonly docs: ReadonlyArray<DocMeta>;
  readonly title: string;
}
