import { createServerOnlyFn } from '@tanstack/solid-start'
import { getRequest } from '@tanstack/solid-start/server'
import { createFileRoute } from '@tanstack/solid-router'
import { Show, Suspense, createResource } from 'solid-js'
import { makeDeferredRecords } from '../../../deferred-records'
import type { DeferredRecord } from '../../../deferred-records'

const getRequestSignal = createServerOnlyFn(() => getRequest().signal)

export const Route = createFileRoute('/stream/$id')({
  loader: ({ params }) => ({
    eager: `eager-${params.id}`,
    alpha: makeDeferredRecords(params.id, 'alpha', getRequestSignal()),
    beta: makeDeferredRecords(params.id, 'beta', getRequestSignal()),
  }),
  component: StreamComponent,
})

function StreamComponent() {
  const data = Route.useLoaderData()

  return (
    <main data-bench="aborted-requests-stream">
      <p data-bench="aborted-requests-eager">{data().eager}</p>
      <Suspense
        fallback={
          <p data-bench="aborted-requests-alpha-fallback">loading-alpha</p>
        }
      >
        <DeferredRecords
          promise={data().alpha}
          dataBench="aborted-requests-alpha"
        />
      </Suspense>
      <Suspense
        fallback={
          <p data-bench="aborted-requests-beta-fallback">loading-beta</p>
        }
      >
        <DeferredRecords
          promise={data().beta}
          dataBench="aborted-requests-beta"
        />
      </Suspense>
    </main>
  )
}

function DeferredRecords(props: {
  promise: Promise<Array<DeferredRecord>>
  dataBench: string
}) {
  const [records] = createResource(
    () => props.promise,
    (promise) => promise,
  )

  return (
    <Show when={records()}>
      {(resolvedRecords) => (
        <ul data-bench={props.dataBench}>
          {resolvedRecords().map((record) => (
            <li>{record.label}</li>
          ))}
        </ul>
      )}
    </Show>
  )
}
