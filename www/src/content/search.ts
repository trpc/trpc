import MiniSearch from 'minisearch';

import { stripInlineCode } from './inline-code.ts';
import type { DocMeta } from './types.ts';

/** A page or a heading, as search finds it. */
export interface SearchEntry {
  /** A page's description; empty for a heading. */
  readonly description: string;
  /** In an experiment (`src/experiments.ts`): found, but marked. */
  readonly experimental: boolean;
  /** The heading's id, or `undefined` for the page itself. */
  readonly hash: string | undefined;
  readonly id: string;
  /** The sidebar section it's in: `Client Usage`. */
  readonly section: string;
  readonly slug: string;
  readonly text: string;
  /**
   * What it sits under inside its section, outermost first: the pages it
   * nests under in the sidebar, then, for a heading, its page and the `h2`
   * an `h3` is under. Empty for a top-level page.
   */
  readonly trail: ReadonlyArray<string>;
}

/** What a query matched in an entry, for `highlight`. */
export interface SearchMatch {
  /** The query's words, lowercased: each marks the start of a word it begins. */
  readonly queryTerms: ReadonlyArray<string>;
  /** The indexed words they found, by prefix or with a typo: marked whole. */
  readonly terms: ReadonlySet<string>;
}

export interface SearchHit {
  readonly entry: SearchEntry;
  readonly match: SearchMatch;
}

const defaultTokenize = MiniSearch.getDefault('tokenize') as (
  text: string,
) => Array<string>;

const camelBoundary = /(?<=[a-z\d])(?=[A-Z])/;

/** `queryOptions` is found by `query`, `options` and `queryoptions`. */
const tokenize = (text: string) =>
  defaultTokenize(text).flatMap((word) => {
    const parts = word.split(camelBoundary);
    return parts.length > 1 ? [word, ...parts] : [word];
  });

const nameOf = (doc: DocMeta) => doc.label ?? doc.title;

function entriesOf(docs: ReadonlyArray<DocMeta>): ReadonlyArray<SearchEntry> {
  const bySlug = new Map(docs.map((doc) => [doc.slug, doc]));
  const parentsOf = (doc: DocMeta): ReadonlyArray<string> => {
    const parent = bySlug.get(doc.parent ?? '');
    return parent && parent !== doc
      ? [...parentsOf(parent), nameOf(parent)]
      : [];
  };
  return docs.flatMap((doc) => {
    const parents = parentsOf(doc);
    const experimental = doc.experiment !== undefined;
    const entries: Array<SearchEntry> = [
      {
        description: doc.description,
        experimental,
        hash: undefined,
        id: doc.slug,
        section: doc.section,
        slug: doc.slug,
        text: nameOf(doc),
        trail: parents,
      },
    ];
    let h2: string | undefined;
    for (const heading of doc.headings) {
      if (heading.depth === 2) {
        h2 = heading.text;
      }
      entries.push({
        description: '',
        experimental,
        hash: heading.id,
        id: `${doc.slug}#${heading.id}`,
        section: doc.section,
        slug: doc.slug,
        text: heading.text,
        trail: [
          ...parents,
          nameOf(doc),
          ...(heading.depth === 3 && h2 !== undefined ? [h2] : []),
        ],
      });
    }
    return entries;
  });
}

/** Where TypeDoc's pages are (`referenceSlug` in `api-reference/convert.ts`). */
const referencePrefix = 'typedoc/';

interface Index {
  readonly byId: ReadonlyMap<string, SearchEntry>;
  readonly pages: ReadonlyArray<SearchEntry>;
  readonly search: MiniSearch<SearchEntry>;
}

const indexes = new WeakMap<ReadonlyArray<DocMeta>, Index>();

function indexOf(docs: ReadonlyArray<DocMeta>): Index {
  const cached = indexes.get(docs);
  if (cached) {
    return cached;
  }
  const entries = entriesOf(docs);
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const search = new MiniSearch<SearchEntry>({
    extractField: (entry, field) => {
      // A page's path: `httpbatchlink` finds `client/links/httpBatchLink`.
      if (field === 'path') {
        return entry.hash === undefined ? entry.slug : '';
      }
      const value = entry[field as keyof SearchEntry];
      if (typeof value === 'string') {
        return stripInlineCode(value);
      }
      return Array.isArray(value) ? stripInlineCode(value.join(' ')) : '';
    },
    fields: ['text', 'trail', 'section', 'description', 'path'],
    searchOptions: {
      boost: { description: 0.5, path: 0.5, section: 0.5, text: 3 },
      // Pages over their headings, guides over the API reference, listed
      // pages over experiments'.
      boostDocument: (id) => {
        const entry = byId.get(String(id));
        return (
          (entry?.hash === undefined ? 1.5 : 1) *
          (entry?.slug.startsWith(referencePrefix) ? 0.4 : 1) *
          (entry?.experimental ? 0.8 : 1)
        );
      },
      combineWith: 'AND',
      fuzzy: 0.2,
      prefix: true,
      tokenize: defaultTokenize,
    },
    tokenize,
  });
  search.addAll(entries);
  const index: Index = {
    byId,
    pages: entries.filter((entry) => entry.hash === undefined),
    search,
  };
  indexes.set(docs, index);
  return index;
}

/** What an entry listed without a query matched: nothing to mark. */
export const noMatch: SearchMatch = { queryTerms: [], terms: new Set() };

/**
 * What `query` finds in `docs` (a version's pages, experiments' included),
 * best first, fuzzy and by prefix, at most `limit`; the first listed pages
 * when it's empty. The index is MiniSearch's, in memory, built on the first
 * search of `docs`. The search dialog and page know only this and
 * `highlight`, so a hosted index (Algolia) can take this file's place.
 */
export function searchDocs(
  docs: ReadonlyArray<DocMeta>,
  query: string,
  limit: number,
): ReadonlyArray<SearchHit> {
  const index = indexOf(docs);
  if (query.trim() === '') {
    return index.pages
      .filter((entry) => !entry.experimental)
      .slice(0, 8)
      .map((entry) => ({ entry, match: noMatch }));
  }
  return index.search
    .search(query)
    .slice(0, limit)
    .flatMap((result) => {
      const entry = index.byId.get(String(result.id));
      return entry
        ? [
            {
              entry,
              match: {
                queryTerms: result.queryTerms,
                terms: new Set(result.terms),
              },
            },
          ]
        : [];
    });
}

/** The entries `ids` name in `docs`, in order, skipping any that are gone. */
export function entriesById(
  docs: ReadonlyArray<DocMeta>,
  ids: ReadonlyArray<string>,
): ReadonlyArray<SearchEntry> {
  const index = indexOf(docs);
  return ids.flatMap((id) => {
    const entry = index.byId.get(id);
    return entry ? [entry] : [];
  });
}

/** Hits grouped by section, the sections in the order of their best hit. */
export function groupBySection<
  T extends { readonly entry: Pick<SearchEntry, 'section'> },
>(
  hits: ReadonlyArray<T>,
): ReadonlyArray<{
  readonly hits: ReadonlyArray<T>;
  readonly section: string;
}> {
  const groups = new Map<string, Array<T>>();
  for (const hit of hits) {
    const group = groups.get(hit.entry.section);
    if (group) {
      group.push(hit);
    } else {
      groups.set(hit.entry.section, [hit]);
    }
  }
  return [...groups].map(([section, grouped]) => ({ hits: grouped, section }));
}

export interface TextRun {
  readonly marked: boolean;
  readonly text: string;
}

/** The words the index splits text into, as MiniSearch's tokenizer does. */
const word = /[^\n\r\p{Z}\p{P}]+/gu;

/** How much of `part`'s start `match` marks: a typed prefix, or a found word. */
function markedLength(part: string, match: SearchMatch) {
  const lower = part.toLowerCase();
  const prefix = Math.max(
    0,
    ...match.queryTerms
      .filter((term) => lower.startsWith(term))
      .map((term) => term.length),
  );
  if (prefix > 0) {
    return Math.min(prefix, part.length);
  }
  return match.terms.has(lower) ? part.length : 0;
}

/**
 * `text` in runs, marked where `match` found it: the typed part of a word
 * found by prefix (`batc` in `batching`), a word found with a typo whole
 * (`batching` for `bathcing`), and the part of a camelCase word that was
 * found (`Options` in `queryOptions`).
 */
export function highlight(
  text: string,
  match: SearchMatch,
): ReadonlyArray<TextRun> {
  const ranges: Array<[number, number]> = [];
  const mark = (start: number, length: number) => {
    const last = ranges.at(-1);
    if (last && start <= last[1]) {
      last[1] = Math.max(last[1], start + length);
    } else if (length > 0) {
      ranges.push([start, start + length]);
    }
  };
  for (const found of text.matchAll(word)) {
    mark(found.index, markedLength(found[0], match));
    let at = found.index;
    for (const part of found[0].split(camelBoundary)) {
      mark(at, markedLength(part, match));
      at += part.length;
    }
  }
  const runs: Array<TextRun> = [];
  let at = 0;
  for (const [start, end] of ranges) {
    if (start > at) {
      runs.push({ marked: false, text: text.slice(at, start) });
    }
    runs.push({ marked: true, text: text.slice(start, end) });
    at = end;
  }
  if (at < text.length) {
    runs.push({ marked: false, text: text.slice(at) });
  }
  return runs;
}
