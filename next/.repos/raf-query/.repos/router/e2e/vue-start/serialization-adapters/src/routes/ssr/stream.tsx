import { Await, createFileRoute } from '@tanstack/vue-router'
import { defineComponent, Suspense } from 'vue'
import { RenderData, makeData } from '~/data'

const RouteComponent = defineComponent({
  setup() {
    const loaderData = Route.useLoaderData()
    return () => (
      <div>
        <h3 data-testid="stream-heading">Stream</h3>
        <div data-testid="some-data">{loaderData.value.someString}</div>
        <Suspense>
          {{
            default: () => (
              <Await
                promise={loaderData.value.dataPromise}
                children={(data: ReturnType<typeof makeData>) => (
                  <RenderData id="stream" data={data} />
                )}
              />
            ),
            fallback: () => <div>Loading...</div>,
          }}
        </Suspense>
      </div>
    )
  },
})

export const Route = createFileRoute('/ssr/stream')({
  loader: () => {
    const dataPromise = new Promise<ReturnType<typeof makeData>>((r) =>
      setTimeout(() => r(makeData()), 1000),
    )
    return {
      someString: 'hello world',
      dataPromise,
    }
  },

  errorComponent: (e) => (
    <div>{e.error instanceof Error ? e.error.message : String(e.error)} </div>
  ),
  component: RouteComponent,
})
