import { describe, expect, it } from '@effect/vitest';

import { searchDocs } from './search.ts';
import type { DocMeta } from './types.ts';

const docs: ReadonlyArray<DocMeta> = [
  {
    description: 'Calls go through a chain of links.',
    headings: [{ depth: 2, id: 'batching', text: 'Batching requests' }],
    section: 'Client',
    slug: 'client/links',
    title: 'Links',
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

const ids = (query: string) => searchDocs(docs, query).map((entry) => entry.id);

describe('searchDocs', () => {
  it('lists the first pages, without experiments, for an empty query', () => {
    expect(ids('')).toEqual([
      'client/links',
      'integrations/tanstack-query/react',
    ]);
  });

  it('finds by prefix and with a typo', () => {
    expect(ids('batc')).toEqual(['client/links#batching']);
    expect(ids('bathcing')).toEqual(['client/links#batching']);
    expect(ids('lnks')).toContain('client/links');
  });

  it('finds every word of a query, inside camelCase too', () => {
    expect(ids('query options')[0]).toBe(
      'integrations/tanstack-query/react#query-options',
    );
    expect(ids('links tanstack')).toEqual([]);
  });

  it("finds experiments' pages, marked", () => {
    const [entry] = searchDocs(docs, 'tanstack db');
    expect(entry).toMatchObject({
      experimental: true,
      id: 'integrations/tanstack-query/tanstack-db',
    });
  });
});
