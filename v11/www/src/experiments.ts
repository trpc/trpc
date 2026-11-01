/**
 * The docs' experiments: features whose pages ship turned off. A page joins
 * one with `experiment: <id>` in its frontmatter; it's served at its URL and
 * found by the site's search and listed in `llms.txt`, but `noindex` and out
 * of the sitemap, and out of the sidebar and pagination until the reader
 * turns its experiment on (`?flags=<id>`, the Experiments menu, or visiting
 * one of its pages). Pure, so the build reads it too.
 */
export const experiments: Record<
  string,
  { readonly description: string; readonly label: string }
> = {};

export type ExperimentId = string;

export const experimentIds: ReadonlyArray<ExperimentId> =
  Object.keys(experiments);
