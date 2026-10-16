import { Suspense, useState } from 'react'
import { Await, createFileRoute } from '@tanstack/react-router'
import { createRouterHtmlPayload } from '../../../../streaming-ssr-fixtures'

export const Route = createFileRoute('/router-html-buffer')({
  loader: () => {
    return {
      payload: createRouterHtmlPayload(),
    }
  },
  component: RouterHtmlBufferRoute,
})

function RouterHtmlBufferRoute() {
  const { payload } = Route.useLoaderData()

  return (
    <main>
      <h2>Router HTML Buffer Reproduction</h2>
      <Suspense fallback={<p>Waiting for the deferred payload...</p>}>
        <Await
          promise={payload}
          children={(result) => (
            <HydratedPayload payload={result.value} source={result.source} />
          )}
        />
      </Suspense>
    </main>
  )
}

function HydratedPayload({
  payload,
  source,
}: {
  payload: string
  source: 'server' | 'client'
}) {
  const [hydrationResult, setHydrationResult] = useState('not checked')

  return (
    <>
      <p data-testid="router-html-payload-length">{payload.length}</p>
      <button
        data-testid="router-html-payload-check"
        onClick={() => {
          setHydrationResult(
            `${source}:${payload.length}:${payload[payload.length - 1]}`,
          )
        }}
        type="button"
      >
        Read hydrated payload
      </button>
      <p data-testid="router-html-payload-result">{hydrationResult}</p>
    </>
  )
}
