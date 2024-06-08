import { Temporal } from '@js-temporal/polyfill';
import {
  defaultShouldDehydrateQuery,
  QueryClient,
} from '@tanstack/react-query';
import type { TsonType } from 'tupleson';
import { createTson, tsonDate } from 'tupleson';

function getBaseUrl() {
  if (typeof window !== 'undefined') return '';
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
}

export function getUrl() {
  return getBaseUrl() + '/api/trpc';
}

export const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        // Since queries are prefetched on the server, we set a stale time so that
        // queries aren't immediately refetched on the client
        staleTime: 1000 * 30,
      },
      dehydrate: {
        // include pending queries in dehydration
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) ||
          query.state.status === 'pending',
      },
    },
  });

const plainDate = {
  deserialize: (v) => Temporal.PlainDate.from(v),
  key: 'PlainDate',
  serialize: (v) => v.toJSON(),
  test: (v) => v instanceof Temporal.PlainDate,
} satisfies TsonType<Temporal.PlainDate, string>;

const plainDateTime = {
  deserialize: (v) => Temporal.PlainDateTime.from(v),
  key: 'PlainDateTime',
  serialize: (v) => v.toJSON(),
  test: (v) => v instanceof Temporal.PlainDateTime,
} satisfies TsonType<Temporal.PlainDateTime, string>;

export const tson = createTson({ types: [plainDate, plainDateTime, tsonDate] });
