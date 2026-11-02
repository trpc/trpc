import MiniSearch from 'minisearch';

import { stripInlineCode } from './inline-code.ts';
import type { DocMeta } from './types.ts';

/** A page or a heading, as search finds it. */
export interface SearchEntry {
  /** In an experiment (`src/experiments.ts`): found, but marked. */
  readonly experimental: boolean;
  /** The heading's id, or `undefined` for the page itself. */
  readonly hash: string | undefined;
  readonly id: string;
  /** What it's in: the page's section, or a heading's page. */
  readonly page: string;
  readonly slug: string;
  readonly text: string;
}

interface Indexed extends SearchEntry {
  readonly description: string;
}

const defaultTokenize = MiniSearch.getDefault('tokenize') as (
  text: string,
) => Array<string>;

/** `queryOptions` is found by `query`, `options` and `queryoptions`. */
const tokenize = (text: string) =>
  defaultTokenize(text).flatMap((word) => {
    const parts = word.split(/(?<=[a-z\d])(?=[A-Z])/);
    return parts.length > 1 ? [word, ...parts] : [word];
  });

function entriesOf(docs: ReadonlyArray<DocMeta>): ReadonlyArray<Indexed> {
  return docs.flatMap((doc) => {
    const title = stripInlineCode(doc.label ?? doc.title);
    const experimental = doc.experiment !== undefined;
    return [
      {
        description: stripInlineCode(`${doc.title} ${doc.description}`),
        experimental,
        hash: undefined,
        id: doc.slug,
        page: doc.section,
        slug: doc.slug,
        text: doc.label ?? doc.title,
      },
      ...doc.headings.map((heading) => ({
        description: '',
        experimental,
        hash: heading.id,
        id: `${doc.slug}#${heading.id}`,
        page: title,
        slug: doc.slug,
        text: heading.text,
      })),
    ];
  });
}

interface Index {
  readonly byId: ReadonlyMap<string, SearchEntry>;
  readonly pages: ReadonlyArray<SearchEntry>;
  readonly search: MiniSearch<Indexed>;
}

const indexes = new WeakMap<ReadonlyArray<DocMeta>, Index>();

function indexOf(docs: ReadonlyArray<DocMeta>): Index {
  const cached = indexes.get(docs);
  if (cached) {
    return cached;
  }
  const entries = entriesOf(docs);
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const search = new MiniSearch<Indexed>({
    extractField: (entry, field) => {
      const value = entry[field as keyof Indexed];
      return typeof value === 'string' ? stripInlineCode(value) : '';
    },
    fields: ['text', 'page', 'description'],
    searchOptions: {
      boost: { description: 0.5, text: 3 },
      // Pages over their headings, listed pages over experiments'.
      boostDocument: (id) => {
        const entry = byId.get(String(id));
        return (
          (entry?.hash === undefined ? 1.5 : 1) *
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

/**
 * What `query` finds in `docs` (a version's pages, experiments' included),
 * best first, fuzzy and by prefix; the first listed pages when it's empty.
 * The index is MiniSearch's, in memory, built on the first search of `docs`.
 * The search dialog knows only this, so a hosted index (Algolia) can take
 * this file's place.
 */
export function searchDocs(
  docs: ReadonlyArray<DocMeta>,
  query: string,
): ReadonlyArray<SearchEntry> {
  const index = indexOf(docs);
  if (query.trim() === '') {
    return index.pages.filter((entry) => !entry.experimental).slice(0, 8);
  }
  return index.search
    .search(query)
    .slice(0, 20)
    .flatMap((result) => {
      const entry = index.byId.get(String(result.id));
      return entry ? [entry] : [];
    });
}
