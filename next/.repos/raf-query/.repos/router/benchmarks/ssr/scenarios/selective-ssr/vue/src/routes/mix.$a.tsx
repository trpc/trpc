import { defineComponent } from 'vue'
import { Outlet, createFileRoute } from '@tanstack/vue-router'
import { makeLevelData } from '../../../../loaders/shared-data'

const LevelAComponent = defineComponent({
  setup() {
    const data = Route.useLoaderData()
    const params = Route.useParams()

    return () => (
      <section>
        <h2>{`level-a-rendered-${params.value.a}`}</h2>
        <p>{data.value.items[0]?.name}</p>
        <Outlet />
      </section>
    )
  },
})

export const Route = createFileRoute('/mix/$a')({
  ssr: true,
  loader: async ({ params }) => {
    return makeLevelData(`level-a-loader-${params.a}`, 1)
  },
  component: LevelAComponent,
})
