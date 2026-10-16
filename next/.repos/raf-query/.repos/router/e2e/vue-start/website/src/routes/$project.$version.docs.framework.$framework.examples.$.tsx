import { defineComponent } from 'vue'
import { createFileRoute } from '@tanstack/vue-router'
import { NotFound } from '~/components/NotFound'
import { capitalize, seo } from '~/utils/seo'

const Page = defineComponent({
  setup() {
    const params = Route.useParams()
    return () => (
      <div class="space-y-2">
        <h4
          data-testid="selected-example-heading"
          class="text-xl font-bold underline"
        >
          {params.value._splat} example
        </h4>
      </div>
    )
  },
})

export const Route = createFileRoute(
  '/$project/$version/docs/framework/$framework/examples/$',
)({
  head: ({ params }) => ({
    meta: seo({
      title: `${capitalize(params._splat || '')} Example | TanStack ${capitalize(params.project)} ${capitalize(params.framework)}`,
    }),
  }),
  component: Page,
  notFoundComponent: () => {
    return <NotFound>Example not found</NotFound>
  },
})
