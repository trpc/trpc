import { Await, createFileRoute } from '@tanstack/react-router'
import { Suspense } from 'react'
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
  const { deferredData } = Route.useLoaderData()

  return (
    <div style={{ padding: '20px' }}>
      <h2>Deferred Rejection Test</h2>
      <Suspense
        fallback={<div data-testid="deferred-loading">Loading deferred...</div>}
      >
        <Await
          promise={deferredData}
          children={(data) => <div data-testid="deferred-data">{data}</div>}
        />
      </Suspense>
    </div>
  )
}
