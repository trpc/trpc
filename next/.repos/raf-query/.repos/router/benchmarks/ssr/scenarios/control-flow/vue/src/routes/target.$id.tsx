import { defineComponent } from 'vue'
import { createFileRoute } from '@tanstack/vue-router'

const TargetComponent = defineComponent({
  setup() {
    const params = Route.useParams()

    return () => <main>{`target-${params.value.id}`}</main>
  },
})

export const Route = createFileRoute('/target/$id')({
  component: TargetComponent,
})
