import { Await, createFileRoute } from '@tanstack/vue-router'
import { createServerFn } from '@tanstack/vue-start'
import { Suspense } from 'vue'
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
        Quick: {data.value.quickData.name} @ {data.value.quickData.timestamp}
      </div>
      <div data-testid="quick-source">
        Quick data source: {data.value.quickData.source}
      </div>
      <div data-testid="loader-source">
        Loader source: {data.value.loaderSource}
      </div>
      <Suspense>
        {{
          default: () => (
            <Await
              promise={data.value.deferredData}
              children={(value: { message: string; source: string }) => (
                <div data-testid="deferred-resolved">
                  {value.message} (source: {value.source})
                </div>
              )}
            />
          ),
          fallback: () => <div data-testid="deferred-loading">Loading...</div>,
        }}
      </Suspense>
      {slowRenderComponents.map((data, index) => (
        <SlowComponent data={data} index={index + 1} />
      ))}
    </div>
  )
}
