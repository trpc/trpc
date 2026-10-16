import { defineComponent } from 'vue'
import { Outlet, createFileRoute } from '@tanstack/vue-router'
import {
  makeLargePageHead,
  makeLargePageLevelData,
} from '../../../large-page-data'

const LevelSixComponent = defineComponent({
  setup() {
    const data = Route.useLoaderData()

    return () => {
      const first = data.value.records[0]!

      return (
        <section data-bench={data.value.marker}>
          <h2>{data.value.marker}</h2>
          <p>records: {data.value.records.length}</p>
          <article>
            <h3>{first.name}</h3>
            <p>{first.id}</p>
            <p>{first.description}</p>
          </article>
          <Outlet />
        </section>
      )
    }
  },
})

export const Route = createFileRoute('/l1/l2/l3/l4/l5/l6')({
  loader: () => makeLargePageLevelData(6, 0x5eed_1006),
  head: ({ loaderData }) => makeLargePageHead(loaderData),
  component: LevelSixComponent,
})
