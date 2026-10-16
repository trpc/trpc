import { Await, createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { Suspense } from 'react'
import {
  deferredDataDelay,
  deferredDataMessage,
  deferredImmediateName,
  deferredServerDelay,
  deferredSlowName,
  delay,
  makeDeferredMessage,
  makeServerData,
  sourceMarker,
} from '../../../../streaming-ssr-fixtures'

const getImmediateData = createServerFn({ method: 'GET' })
  .validator((data: { name: string }) => data)
  .handler(({ data }) => makeServerData(data.name))

const getSlowData = createServerFn({ method: 'GET' })
  .validator((data: { name: string; delay: number }) => data)
  .handler(async ({ data }) => {
    await delay(data.delay)
    return makeServerData(data.name)
  })

export const Route = createFileRoute('/deferred')({
  loader: async () => {
    return {
      deferredData: makeDeferredMessage(deferredDataMessage, deferredDataDelay),
      deferredServerData: getSlowData({
        data: { name: deferredSlowName, delay: deferredServerDelay },
      }),
      immediateData: await getImmediateData({
        data: { name: deferredImmediateName },
      }),
      loaderSource: sourceMarker(),
    }
  },
  component: Deferred,
})

function Deferred() {
  const { deferredData, deferredServerData, immediateData, loaderSource } =
    Route.useLoaderData()

  return (
    <div style={{ padding: '20px' }}>
      <h2>Deferred Data Test</h2>

      <div data-testid="immediate-data">
        Immediate: {immediateData.name} @ {immediateData.timestamp}
      </div>

      <div data-testid="immediate-source">
        Immediate source: {immediateData.source}
      </div>

      <div data-testid="loader-source">Loader source: {loaderSource}</div>

      <Suspense
        fallback={<div data-testid="deferred-loading">Loading deferred...</div>}
      >
        <Await
          promise={deferredData}
          children={(data) => (
            <div data-testid="deferred-data">
              {data.message} (source: {data.source})
            </div>
          )}
        />
      </Suspense>

      <Suspense
        fallback={
          <div data-testid="server-loading">Loading server data...</div>
        }
      >
        <Await
          promise={deferredServerData}
          children={(data) => (
            <div data-testid="deferred-server-data">
              Server: {data.name} @ {data.timestamp} (source: {data.source})
            </div>
          )}
        />
      </Suspense>
    </div>
  )
}
