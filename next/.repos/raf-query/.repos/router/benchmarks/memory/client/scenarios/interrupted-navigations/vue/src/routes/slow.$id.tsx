import { defineComponent } from 'vue'
import { createFileRoute } from '@tanstack/vue-router'
import { getSlowLoaderDeferred } from '../../../slow-loaders'

const SlowComponent = defineComponent({
  setup() {
    const data = Route.useLoaderData()

    return () => (
      <main data-bench-id={data.value.id} data-bench-page="slow">
        {`${data.value.kind}:${data.value.id}:${data.value.ts}`}
      </main>
    )
  },
})

export const Route = createFileRoute('/slow/$id')({
  loader: async ({ params }: { params: { id: string } }) => {
    const deferred = getSlowLoaderDeferred(params.id)

    return await deferred.promise
  },
  component: SlowComponent,
})
