// @vitest-environment node

import { QueryClient, dehydrate, dehydrateQuery } from '@tanstack/query-core'
import { afterAll, bench, describe, expect } from 'vitest'
import type { Query } from '@tanstack/query-core'

type DehydratedQuery = ReturnType<typeof dehydrateQuery>

let benchmarkSink = 0

describe.each([
  { cachedQueryCount: 10, selectedQueryCount: 1 },
  { cachedQueryCount: 100, selectedQueryCount: 10 },
  { cachedQueryCount: 1_000, selectedQueryCount: 10 },
  { cachedQueryCount: 10_000, selectedQueryCount: 10 },
])(
  'dehydrate $selectedQueryCount of $cachedQueryCount cached queries',
  ({ cachedQueryCount, selectedQueryCount }) => {
    const queryClient = new QueryClient()

    for (let index = 0; index < cachedQueryCount; index++) {
      queryClient.setQueryData(['query', index], `data-${index}`)
    }

    const selectedQueries = new Map<string, Query>()
    for (
      let index = cachedQueryCount - selectedQueryCount;
      index < cachedQueryCount;
      index++
    ) {
      const query = queryClient.getQueryCache().find({
        queryKey: ['query', index],
      })!
      selectedQueries.set(query.queryHash, query)
    }
    const selectedQueryHashes = new Set(selectedQueries.keys())

    const scannedQueries = dehydrate(queryClient, {
      shouldDehydrateQuery: (query) => selectedQueryHashes.has(query.queryHash),
    }).queries
    const directlyDehydratedQueries = Array.from(
      selectedQueries.values(),
      (query) => dehydrateQuery(query),
    )

    expect(directlyDehydratedQueries.map(comparableQuery)).toEqual(
      scannedQueries.map(comparableQuery),
    )

    afterAll(() => queryClient.clear())

    bench('filter full query cache', () => {
      const dehydratedQueries = dehydrate(queryClient, {
        shouldDehydrateQuery: (query) =>
          selectedQueryHashes.has(query.queryHash),
      }).queries
      benchmarkSink = consumeQueries(dehydratedQueries)
    })

    bench('dehydrate direct query references', () => {
      const dehydratedQueries = new Array<DehydratedQuery>()
      for (const query of selectedQueries.values()) {
        dehydratedQueries.push(dehydrateQuery(query))
      }
      benchmarkSink = consumeQueries(dehydratedQueries)
    })
  },
)

function comparableQuery({ dehydratedAt: _, ...query }: DehydratedQuery) {
  return query
}

function consumeQueries(queries: Array<DehydratedQuery>) {
  let value = 0
  for (const query of queries) {
    value += (query.dehydratedAt ?? 0) + query.queryHash.length
    if (typeof query.state.data === 'string') {
      value += query.state.data.length
    }
  }
  return value
}

void benchmarkSink
