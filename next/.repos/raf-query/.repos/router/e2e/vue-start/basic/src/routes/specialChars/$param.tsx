import { defineComponent } from 'vue'
import { createFileRoute } from '@tanstack/vue-router'

const RouteComponent = defineComponent({
  setup() {
    const params = Route.useParams()
    return () => (
      <div>
        Hello "/specialChars/$param":{' '}
        <span data-testid={'special-param'}>{params.value.param}</span>
      </div>
    )
  },
})

export const Route = createFileRoute('/specialChars/$param')({
  component: RouteComponent,
})
