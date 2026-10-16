import { defineComponent } from 'vue'
import { createFileRoute } from '@tanstack/vue-router'

const AComponent = defineComponent({
  setup() {
    const data = Route.useLoaderData()

    return () => <main data-bench-page={data.value.id}>{data.value.id}</main>
  },
})

export const Route = createFileRoute('/a')({
  loader: () => ({ id: 'a' }),
  component: AComponent,
})
