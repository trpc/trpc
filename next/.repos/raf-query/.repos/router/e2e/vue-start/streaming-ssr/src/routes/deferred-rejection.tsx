import { Await, createFileRoute } from '@tanstack/vue-router'
import { Suspense } from 'vue'
import {
  deferredDataDelay,
  deferredErrorMessage,
} from '../../../../streaming-ssr-fixtures'

export const Route = createFileRoute('/deferred-rejection')({
  loader: async () => {
    return {
      deferredData: new Promise<string>((_resolve, reject) => {
        setTimeout(() => {
          reject(new Error(deferredErrorMessage))
        }, deferredDataDelay)
      }),
    }
  },
  errorComponent: ({ error }) => (
    <div data-testid="deferred-error-boundary">
      {error instanceof Error ? error.message : String(error)}
    </div>
  ),
  component: DeferredRejection,
})

function DeferredRejection() {
  const data = Route.useLoaderData()

  return (
    <div style={{ padding: '20px' }}>
      <h2>Deferred Rejection Test</h2>
      <Suspense>
        {{
          default: () => (
            <Await
              promise={data.value.deferredData}
              children={(value: string) => (
                <div data-testid="deferred-data">{value}</div>
              )}
            />
          ),
          fallback: () => (
            <div data-testid="deferred-loading">Loading deferred...</div>
          ),
        }}
      </Suspense>
    </div>
  )
}
