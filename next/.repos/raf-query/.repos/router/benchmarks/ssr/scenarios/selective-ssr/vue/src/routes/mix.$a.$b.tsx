import { defineComponent } from 'vue'
import { Outlet, createFileRoute } from '@tanstack/vue-router'
import { makeLevelData } from '../../../../loaders/shared-data'

const LevelBComponent = defineComponent({
  setup() {
    const data = Route.useLoaderData()
    const params = Route.useParams()

    return () => (
      <section>
        <h2>{`data-only-rendered-${params.value.b}`}</h2>
        <p>{data.value.marker}</p>
        <Outlet />
      </section>
    )
  },
})

export const Route = createFileRoute('/mix/$a/$b')({
  ssr: 'data-only',
  loader: async ({ params }) => {
    return {
      marker: `level-b-loader-${params.b}`,
      data: makeLevelData(`level-b-data-${params.b}`, 2),
    }
  },
  component: LevelBComponent,
})
