import { defineComponent } from 'vue'
import { createFileRoute } from '@tanstack/vue-router'
import { makeSerializationPayload } from '../../../serialization-payload'

const DataComponent = defineComponent({
  setup() {
    const data = Route.useLoaderData()

    return () => (
      <main data-bench="serialization-payload">
        Map size: {data.value.lookup.size}
      </main>
    )
  },
})

export const Route = createFileRoute('/data/$id')({
  loader: ({ params }) => makeSerializationPayload(params.id),
  component: DataComponent,
})
