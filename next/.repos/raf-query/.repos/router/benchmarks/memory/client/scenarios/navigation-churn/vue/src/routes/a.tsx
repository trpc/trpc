import { defineComponent } from 'vue'
import { createFileRoute } from '@tanstack/vue-router'

const fixedTimestamp = 1_700_000_000_000

const AComponent = defineComponent({
  setup() {
    const data = Route.useLoaderData()

    return () => (
      <main data-bench-page="a">{`${data.value.name}:${data.value.ts}`}</main>
    )
  },
})

export const Route = createFileRoute('/a')({
  loader: () => ({ name: 'a', ts: fixedTimestamp }),
  component: AComponent,
})
