import { Await, createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { Suspense } from 'react'
import {
  makeDeferredMessage,
  makeServerData,
  slowRenderComponents,
  slowRenderDeferredDelay,
  slowRenderDeferredMessage,
  slowRenderQuickName,
  sourceMarker,
} from '../../../../streaming-ssr-fixtures'

const getQuickData = createServerFn({ method: 'GET' }).handler(() =>
  makeServerData(slowRenderQuickName),
)

function SlowComponent({ data, index }: { data: string; index: number }) {
  const startTime = Date.now()
  while (Date.now() - startTime < 100) {}
  return <div data-testid={`slow-component-${index}`}>{data}</div>
}

export const Route = createFileRoute('/slow-render')({
  loader: async () => {
    const quickData = await getQuickData()
    return {
      quickData,
      deferredData: makeDeferredMessage(
        slowRenderDeferredMessage,
        slowRenderDeferredDelay,
      ),
      loaderSource: sourceMarker(),
    }
  },
  component: SlowRender,
})

function SlowRender() {
  const { quickData, deferredData, loaderSource } = Route.useLoaderData()

  return (
    <div style={{ padding: '20px' }}>
      <h2>Slow Render Test</h2>
      <p>Tests when render takes longer than serialization.</p>

      <div data-testid="quick-data">
        Quick: {quickData.name} @ {quickData.timestamp}
      </div>

      <div data-testid="quick-source">
        Quick data source: {quickData.source}
      </div>

      <div data-testid="loader-source">Loader source: {loaderSource}</div>

      <Suspense fallback={<div data-testid="deferred-loading">Loading...</div>}>
        <Await
          promise={deferredData}
          children={(data) => (
            <div data-testid="deferred-resolved">
              {data.message} (source: {data.source})
            </div>
          )}
        />
      </Suspense>

      {slowRenderComponents.map((data, index) => (
        <SlowComponent key={data} data={data} index={index + 1} />
      ))}
    </div>
  )
}
