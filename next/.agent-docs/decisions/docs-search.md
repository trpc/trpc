# The docs' search is fuzzy, in memory, and small enough to swap for Algolia (human asked)

- Human, 2026-10-20: "make sure search is fast and fuzzy, but maybe we're gonna migrate to algolia soon so don't do too much".
- (agent) The search dialog (⌘K) searches the version being read with MiniSearch (`minisearch`, about 6 kB minified and gzipped), in memory: each page (its sidebar name, section, title and description) and each heading (its text and page) is an entry. The index is built on the dialog's first search of a version, a few tens of milliseconds for thousands of entries, and each keystroke's search takes a millisecond or two.
- (agent) A query matches by prefix and with typos (an edit for every five letters), every word of it in an entry, and `queryOptions` is found by `query` and `options` too. Names count three times the rest; a page ranks above its headings, and a listed page above an experiment's ([`docs-experiments.md`](./docs-experiments.md)). With no query, the dialog suggests the first eight listed pages.
- (agent) The dialog knows only `searchDocs(docs, query)` in `www/src/content/search.ts` and the entries it returns, so a hosted index (Algolia's DocSearch) replaces that file and the build step that would feed it, not the dialog.
- Why: the old search matched exact substrings only, so a typo found nothing; a library gets typos, prefixes and ranking in one small file, and anything bigger (page bodies, a build-time index) would be thrown away by a move to Algolia.
- Lost: matches in page bodies (only titles, descriptions and headings are indexed); a hand-rolled matcher with no dependency; results across versions.
- Open: whether to move to Algolia.
- Lives in: `next/www/src/content/search.ts`, `next/www/src/content/search.test.ts`, `next/www/src/components/search.tsx`.
