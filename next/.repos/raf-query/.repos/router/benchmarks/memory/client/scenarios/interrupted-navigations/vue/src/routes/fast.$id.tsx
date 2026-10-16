import { defineComponent } from 'vue'
import { createFileRoute } from '@tanstack/vue-router'
import { fixedTimestamp } from '../../../slow-loaders'

const FastComponent = defineComponent({
  setup() {
    const data = Route.useLoaderData()

    return () => (
      <main data-bench-id={data.value.id} data-bench-page="fast">
        {`${data.value.kind}:${data.value.id}:${data.value.ts}`}
      </main>
    )
  },
})

export const Route = createFileRoute('/fast/$id')({
  loader: ({ params }: { params: { id: string } }) => ({
    id: params.id,
    kind: 'fast' as const,
    ts: fixedTimestamp,
  }),
  component: FastComponent,
})
