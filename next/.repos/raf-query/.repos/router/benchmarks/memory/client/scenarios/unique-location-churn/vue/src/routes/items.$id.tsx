import { defineComponent } from 'vue'
import { createFileRoute } from '@tanstack/vue-router'

type ItemSearch = {
  q: string
}

const ItemComponent = defineComponent({
  setup() {
    const data = Route.useLoaderData()

    return () => (
      <main
        data-bench-id={data.value.id}
      >{`${data.value.id}:${data.value.q}:${data.value.checksum}`}</main>
    )
  },
})

export const Route = createFileRoute('/items/$id')({
  validateSearch: (search: Record<string, unknown>): ItemSearch => ({
    q: typeof search.q === 'string' ? search.q : '',
  }),
  loaderDeps: ({ search }: { search: ItemSearch }) => ({ q: search.q }),
  loader: ({
    params,
    deps,
  }: {
    params: { id: string }
    deps: { q: string }
  }) => ({
    id: params.id,
    q: deps.q,
    checksum: params.id.length + deps.q.length,
  }),
  component: ItemComponent,
})
