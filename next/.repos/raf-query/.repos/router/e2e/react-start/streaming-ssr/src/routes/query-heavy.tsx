import { queryOptions, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { Suspense } from 'react'
import {
  delay,
  makeQueryData,
  queryHeavyItems,
} from '../../../../streaming-ssr-fixtures'
import type { QueryData } from '../../../../streaming-ssr-fixtures'

function makeQueryOptions(item: (typeof queryHeavyItems)[number]) {
  return queryOptions({
    queryKey: ['streaming-ssr-query-heavy', item.type, item.id],
    queryFn: (): QueryData | Promise<QueryData> => {
      if (item.delayMs > 0) {
        return delay(item.delayMs).then(() => makeQueryData(item))
      }

      return makeQueryData(item)
    },
    staleTime: Infinity,
  })
}

const syncQuery1 = makeQueryOptions(queryHeavyItems[0])
const syncQuery2 = makeQueryOptions(queryHeavyItems[1])
const syncQuery3 = makeQueryOptions(queryHeavyItems[2])
const fastAsyncQuery1 = makeQueryOptions(queryHeavyItems[3])
const fastAsyncQuery2 = makeQueryOptions(queryHeavyItems[4])
const fastAsyncQuery3 = makeQueryOptions(queryHeavyItems[5])
const slowAsyncQuery1 = makeQueryOptions(queryHeavyItems[6])
const slowAsyncQuery2 = makeQueryOptions(queryHeavyItems[7])
const slowAsyncQuery3 = makeQueryOptions(queryHeavyItems[8])

type QueryOptions = ReturnType<typeof makeQueryOptions>

export const Route = createFileRoute('/query-heavy')({
  component: QueryHeavy,
})

function QueryDisplay({
  queryOpts,
  testId,
}: {
  queryOpts: QueryOptions
  testId: string
}) {
  const { data } = useSuspenseQuery(queryOpts)
  return (
    <div data-testid={testId}>
      {data.value} (source: {data.source})
    </div>
  )
}

function QueryHeavy() {
  return (
    <div style={{ padding: '20px' }}>
      <h2>Query Heavy Test (9 useSuspenseQuery calls)</h2>
      <p>Tests multiple useSuspenseQuery with mixed sync/async queryFn.</p>
      <p>
        All queries should show "source: server" if SSR streaming works
        correctly.
      </p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '20px',
          marginTop: '20px',
        }}
      >
        <div>
          <h3>Sync Queries (immediate)</h3>
          <Suspense
            fallback={<div data-testid="sync-1-loading">Loading sync 1...</div>}
          >
            <QueryDisplay queryOpts={syncQuery1} testId="sync-query-1" />
          </Suspense>
          <Suspense
            fallback={<div data-testid="sync-2-loading">Loading sync 2...</div>}
          >
            <QueryDisplay queryOpts={syncQuery2} testId="sync-query-2" />
          </Suspense>
          <Suspense
            fallback={<div data-testid="sync-3-loading">Loading sync 3...</div>}
          >
            <QueryDisplay queryOpts={syncQuery3} testId="sync-query-3" />
          </Suspense>
        </div>

        <div>
          <h3>Fast Async Queries (50-100ms)</h3>
          <Suspense
            fallback={
              <div data-testid="fast-async-1-loading">Loading fast 1...</div>
            }
          >
            <QueryDisplay
              queryOpts={fastAsyncQuery1}
              testId="fast-async-query-1"
            />
          </Suspense>
          <Suspense
            fallback={
              <div data-testid="fast-async-2-loading">Loading fast 2...</div>
            }
          >
            <QueryDisplay
              queryOpts={fastAsyncQuery2}
              testId="fast-async-query-2"
            />
          </Suspense>
          <Suspense
            fallback={
              <div data-testid="fast-async-3-loading">Loading fast 3...</div>
            }
          >
            <QueryDisplay
              queryOpts={fastAsyncQuery3}
              testId="fast-async-query-3"
            />
          </Suspense>
        </div>

        <div>
          <h3>Slow Async Queries (200-400ms)</h3>
          <Suspense
            fallback={
              <div data-testid="slow-async-1-loading">Loading slow 1...</div>
            }
          >
            <QueryDisplay
              queryOpts={slowAsyncQuery1}
              testId="slow-async-query-1"
            />
          </Suspense>
          <Suspense
            fallback={
              <div data-testid="slow-async-2-loading">Loading slow 2...</div>
            }
          >
            <QueryDisplay
              queryOpts={slowAsyncQuery2}
              testId="slow-async-query-2"
            />
          </Suspense>
          <Suspense
            fallback={
              <div data-testid="slow-async-3-loading">Loading slow 3...</div>
            }
          >
            <QueryDisplay
              queryOpts={slowAsyncQuery3}
              testId="slow-async-query-3"
            />
          </Suspense>
        </div>
      </div>
    </div>
  )
}
