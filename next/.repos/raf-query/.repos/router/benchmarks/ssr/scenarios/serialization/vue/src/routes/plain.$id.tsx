import { defineComponent } from 'vue'
import { createFileRoute } from '@tanstack/vue-router'
import { makePlainSerializationData } from '../../../shared-data'

const PlainComponent = defineComponent({
  setup() {
    const data = Route.useLoaderData()

    return () => (
      <section>
        <h1>{data.value.label}</h1>
        <p>{data.value.createdAt}</p>
        <p>{data.value.lookup[0]?.[1].label}</p>
        <p>{data.value.tags[0]}</p>
        <p>{data.value.count}</p>
        <p>{data.value.nested[0]?.id}</p>
        <p>{data.value.points[0]?.label}</p>
        <p>{data.value.problem.message}</p>
      </section>
    )
  },
})

export const Route = createFileRoute('/plain/$id')({
  loader: ({ params }) => makePlainSerializationData(params.id),
  component: PlainComponent,
})
