import {
  defaultShouldDehydrateQuery,
  QueryClient,
} from '@tanstack/react-query';
import { transformer } from './transformer';

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30 * 1000,
      },
      dehydrate: {
        serializeData: transformer.serialize,
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) ||
          query.state.status === 'pending',
      },
      hydrate: {
        deserializeData: transformer.deserialize,
      },
    },
  });
}
