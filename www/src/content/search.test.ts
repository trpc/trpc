import { describe, expect, it } from '@effect/vitest';

import {
  entriesById,
  groupBySection,
  highlight,
  searchDocs,
  type SearchMatch,
} from './search.ts';
import type { DocMeta } from './types.ts';

const docs: ReadonlyArray<DocMeta> = [
  {
    description: 'Calls go through a chain of links.',
    headings: [{ depth: 2, id: 'batching', text: 'Batching requests' }],
    label: 'Links',
    section: 'Client',
    slug: 'client/links',
    title: 'Links Overview',
  },
  {
    description: 'Batches calls into one request.',
    headings: [
      { depth: 2, id: 'options', text: 'Options' },
      { depth: 3, id: 'max-items', text: '`maxItems`' },
    ],
    label: '`httpBatchLink`',
    parent: 'client/links',
    section: 'Client',
    slug: 'client/links/httpBatchLink',
    title: 'HTTP Batch Link',
  },
  {
    description: 'Query and mutation options for TanStack Query.',
    headings: [{ depth: 2, id: 'query-options', text: '`queryOptions()`' }],
    section: 'Integrations',
    slug: 'integrations/tanstack-query/react',
    title: 'TanStack React Query',
  },
  {
    description: "A TanStack DB collection over a procedure's queryOptions().",
    experiment: 'tanstack-db',
    headings: [],
    section: 'Integrations',
    slug: 'integrations/tanstack-query/tanstack-db',
    title: 'TanStack DB',
  },
];

const ids = (query: string) =>
  searchDocs(docs, query, 20).map((hit) => hit.entry.id);

const marked = (text: string, match: SearchMatch) =>
  highlight(text, match)
    .filter((run) => run.marked)
    .map((run) => run.text);

const matchOf = (query: string, id: string) => {
  const hit = searchDocs(docs, query, 20).find((one) => one.entry.id === id);
  if (!hit) {
    throw new Error(`"${query}" doesn't find ${id}`);
  }
  return hit.match;
};

describe('searchDocs', () => {
  it('lists the first pages, without experiments, for an empty query', () => {
    expect(ids('')).toEqual([
      'client/links',
      'client/links/httpBatchLink',
      'integrations/tanstack-query/react',
    ]);
  });

  it('finds by prefix and with a typo', () => {
    expect(ids('batc')).toContain('client/links#batching');
    expect(ids('bathcing')).toEqual(['client/links#batching']);
    expect(ids('lnks')).toContain('client/links');
  });

  it('takes no typo in a word of three letters', () => {
    expect(ids('lnk')).toEqual([]);
  });

  it('finds every word of a query, inside camelCase too', () => {
    expect(ids('query options')[0]).toBe(
      'integrations/tanstack-query/react#query-options',
    );
    expect(ids('links tanstack')).toEqual([]);
  });

  it('stops at the limit', () => {
    expect(searchDocs(docs, 'client', 2)).toHaveLength(2);
    expect(searchDocs(docs, '', 2)).toHaveLength(2);
    expect(searchDocs(docs, '', 0)).toEqual([]);
  });

  it("finds a page by its full title, where it's labelled shorter", () => {
    expect(ids('overview')).toEqual(['client/links']);
    expect(ids('links overview')[0]).toBe('client/links');
  });

  it('ranks a page named for the query over headings, plural or not', () => {
    expect(ids('batching')[0]).toBe('client/links/httpBatchLink');
    expect(ids('link')[0]).toBe('client/links');
    expect(
      marked(
        '`httpBatchLink`',
        matchOf('batching', 'client/links/httpBatchLink'),
      ),
    ).toEqual(['Batch']);
  });

  it("finds experiments' pages, marked", () => {
    const [hit] = searchDocs(docs, 'tanstack db', 20);
    expect(hit?.entry).toMatchObject({
      experimental: true,
      id: 'integrations/tanstack-query/tanstack-db',
    });
  });

  it('places a heading under its pages and its h2', () => {
    const [hit] = searchDocs(docs, 'maxitems', 20);
    expect(hit?.entry).toMatchObject({
      hash: 'max-items',
      section: 'Client',
      trail: ['Links', '`httpBatchLink`', 'Options'],
    });
  });

  it('places a page under the pages it nests under', () => {
    expect(entriesById(docs, ['client/links/httpBatchLink'])).toMatchObject([
      { hash: undefined, trail: ['Links'] },
    ]);
  });

  it('finds a heading by the pages it sits under', () => {
    expect(ids('httpbatchlink options')[0]).toBe(
      'client/links/httpBatchLink#options',
    );
  });
});

describe('entriesById', () => {
  it('skips ids that are gone', () => {
    expect(
      entriesById(docs, ['client/links#batching', 'gone', 'client/links']).map(
        (entry) => entry.id,
      ),
    ).toEqual(['client/links#batching', 'client/links']);
  });
});

describe('groupBySection', () => {
  it('groups by section, in the order of their best hit', () => {
    const hit = (id: string, section: string) => ({ entry: { id, section } });
    const grouped = groupBySection([
      hit('a', 'B'),
      hit('b', 'A'),
      hit('c', 'B'),
    ]);
    expect(
      grouped.map((group) => [
        group.section,
        group.hits.map((one) => one.entry.id),
      ]),
    ).toEqual([
      ['B', ['a', 'c']],
      ['A', ['b']],
    ]);
  });
});

describe('highlight', () => {
  it('marks the typed part of a word found by prefix', () => {
    expect(
      highlight('Batching requests', matchOf('batc', 'client/links#batching')),
    ).toEqual([
      { marked: true, text: 'Batc' },
      { marked: false, text: 'hing requests' },
    ]);
  });

  it('marks a word found with a typo whole', () => {
    expect(
      marked('Batching requests', matchOf('bathcing', 'client/links#batching')),
    ).toEqual(['Batching']);
    expect(marked('Links', matchOf('lnks', 'client/links'))).toEqual(['Links']);
  });

  it('marks the part of a camelCase word that was found', () => {
    const match = matchOf(
      'options',
      'integrations/tanstack-query/react#query-options',
    );
    expect(marked('queryOptions()', match)).toEqual(['Options']);
  });

  it('marks every word of the query, wherever it shows', () => {
    const match = matchOf(
      'tanstack query opt',
      'integrations/tanstack-query/react#query-options',
    );
    expect(marked('queryOptions()', match)).toEqual(['queryOpt']);
    expect(marked('TanStack React Query', match)).toEqual([
      'TanStack',
      'Query',
    ]);
  });

  it('marks nothing without a match', () => {
    expect(highlight('Links', { queryTerms: [], terms: new Set() })).toEqual([
      { marked: false, text: 'Links' },
    ]);
  });
});
