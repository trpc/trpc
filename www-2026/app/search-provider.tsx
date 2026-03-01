'use client';

import AlgoliaSearchDialog from 'fumadocs-ui/components/dialog/search-algolia';
import { liteClient } from 'algoliasearch/lite';
import type { SharedProps } from 'fumadocs-ui/components/dialog/search';

const algoliaClient = liteClient(
  'BTGPSR4MOE',
  'ed8b3896f8e3e2b421e4c38834b915a8',
);

export function SearchProvider(props: SharedProps) {
  return (
    <AlgoliaSearchDialog
      {...props}
      searchOptions={{
        indexName: 'trpc',
        client: algoliaClient,
      }}
    />
  );
}
