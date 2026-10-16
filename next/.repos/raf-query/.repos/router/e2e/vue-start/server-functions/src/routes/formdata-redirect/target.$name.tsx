import { defineComponent } from 'vue'
import { createFileRoute } from '@tanstack/vue-router'

const RouteComponent = defineComponent({
  setup() {
    const params = Route.useParams()
    return () => (
      <div data-testid="formdata-redirect-target">
        Hello{' '}
        <span data-testid="formdata-redirect-target-name">
          {params.value.name}
        </span>
        !
      </div>
    )
  },
})

export const Route = createFileRoute('/formdata-redirect/target/$name')({
  component: RouteComponent,
})
