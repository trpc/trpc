import { defineComponent } from 'vue'
import { createFileRoute } from '@tanstack/vue-router'
import {
  getGlobalMiddlewareContext,
  makeDocumentMarker,
  type GlobalMiddlewareContext,
} from '../../../shared'

const PageComponent = defineComponent({
  setup() {
    const data = Route.useLoaderData()

    return () => <main>{data.value.marker}</main>
  },
})

export const Route = createFileRoute('/page/$id')({
  beforeLoad: ({ serverContext }) => ({
    globalMiddlewareContext: (serverContext ?? {}) as GlobalMiddlewareContext,
  }),
  loader: ({ params, context }) => ({
    marker: makeDocumentMarker(params.id, getGlobalMiddlewareContext(context)),
  }),
  component: PageComponent,
})
