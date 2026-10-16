import { defineComponent } from 'vue'
import { createFileRoute } from '@tanstack/vue-router'
import { RedirectOnClick } from '~/components/RedirectOnClick'

const RouteComponent = defineComponent({
  setup() {
    const params = Route.useParams()
    const search = Route.useSearch()
    return () => (
      <RedirectOnClick
        target={params.value.target}
        reloadDocument={search.value.reloadDocument}
        externalHost={search.value.externalHost}
      />
    )
  },
})

export const Route = createFileRoute(
  '/redirect/$target/serverFn/via-useServerFn',
)({
  component: RouteComponent,
})
