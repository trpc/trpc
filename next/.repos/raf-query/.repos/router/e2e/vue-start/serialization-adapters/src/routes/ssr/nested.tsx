import { defineComponent } from 'vue'
import { createFileRoute } from '@tanstack/vue-router'
import { RenderNestedData, makeNested } from '~/data'

const RouteComponent = defineComponent({
  setup() {
    const loaderData = Route.useLoaderData()
    return () => <RenderNestedData nested={loaderData.value.nested} />
  },
})

export const Route = createFileRoute('/ssr/nested')({
  beforeLoad: () => {
    return { nested: makeNested() }
  },
  loader: ({ context }) => {
    return context
  },
  component: RouteComponent,
})
