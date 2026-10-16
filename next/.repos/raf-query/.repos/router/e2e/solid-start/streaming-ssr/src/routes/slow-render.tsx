import { Await, createFileRoute } from '@tanstack/solid-router'
import { createServerFn } from '@tanstack/solid-start'
import { Suspense } from 'solid-js'
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

function SlowComponent(props: { data: string; index: number }) {
  const startTime = Date.now()
  while (Date.now() - startTime < 100) {
    // Simulate slow render work.
  }
  return <div data-testid={`slow-component-${props.index}`}>{props.data}</div>
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
  const data = Route.useLoaderData()

  return (
    <div style={{ padding: '20px' }}>
      <h2>Slow Render Test</h2>
      <p>Tests when render takes longer than serialization.</p>
      <div data-testid="quick-data">
        Quick: {data().quickData.name} @ {data().quickData.timestamp}
      </div>
      <div data-testid="quick-source">
        Quick data source: {data().quickData.source}
      </div>
      <div data-testid="loader-source">
        Loader source: {data().loaderSource}
      </div>
      <Suspense fallback={<div data-testid="deferred-loading">Loading...</div>}>
        <Await
          promise={data().deferredData}
          children={(value) => (
            <div data-testid="deferred-resolved">
              {value.message} (source: {value.source})
            </div>
          )}
        />
      </Suspense>
      {slowRenderComponents.map((data, index) => (
        <SlowComponent data={data} index={index + 1} />
      ))}
    </div>
  )
}
