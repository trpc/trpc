import { defineComponent } from 'vue'
import { createFileRoute } from '@tanstack/vue-router'
import { createItemPayload, trackItemLoaderCall } from '../../../item-payload'

const ItemComponent = defineComponent({
  setup() {
    const data = Route.useLoaderData()

    return () => (
      <main data-bench-id={data.value.id} data-bench-page="item">
        {`${data.value.id}:${data.value.byteLength}`}
      </main>
    )
  },
})

export const Route = createFileRoute('/items/$id')({
  loader: ({ params }: { params: { id: string } }) => {
    trackItemLoaderCall(params.id)
    return createItemPayload(params.id)
  },
  component: ItemComponent,
})
