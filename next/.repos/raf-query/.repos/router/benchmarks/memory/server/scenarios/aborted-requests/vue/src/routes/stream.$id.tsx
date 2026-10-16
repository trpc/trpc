import { createServerOnlyFn } from '@tanstack/vue-start'
import { getRequest } from '@tanstack/vue-start/server'
import { Await, createFileRoute } from '@tanstack/vue-router'
import { Suspense, defineComponent } from 'vue'
import { makeDeferredRecords } from '../../../deferred-records'
import type { DeferredRecord } from '../../../deferred-records'

const getRequestSignal = createServerOnlyFn(() => getRequest().signal)

const StreamComponent = defineComponent({
  setup() {
    const data = Route.useLoaderData()

    return () => (
      <main data-bench="aborted-requests-stream">
        <p data-bench="aborted-requests-eager">{data.value.eager}</p>
        <p data-bench="aborted-requests-alpha-fallback">loading-alpha</p>
        <p data-bench="aborted-requests-beta-fallback">loading-beta</p>
        <Suspense>
          {{
            default: () => (
              <Await
                promise={data.value.alpha}
                children={(records: Array<DeferredRecord>) => (
                  <ul data-bench="aborted-requests-alpha">
                    {records.map((record) => (
                      <li key={record.id}>{record.label}</li>
                    ))}
                  </ul>
                )}
              />
            ),
            fallback: () => null,
          }}
        </Suspense>
        <Suspense>
          {{
            default: () => (
              <Await
                promise={data.value.beta}
                children={(records: Array<DeferredRecord>) => (
                  <ul data-bench="aborted-requests-beta">
                    {records.map((record) => (
                      <li key={record.id}>{record.label}</li>
                    ))}
                  </ul>
                )}
              />
            ),
            fallback: () => null,
          }}
        </Suspense>
      </main>
    )
  },
})

export const Route = createFileRoute('/stream/$id')({
  loader: ({ params }) => ({
    eager: `eager-${params.id}`,
    alpha: makeDeferredRecords(params.id, 'alpha', getRequestSignal()),
    beta: makeDeferredRecords(params.id, 'beta', getRequestSignal()),
  }),
  component: StreamComponent,
})
