import { defineComponent } from 'vue'
import { Link, createFileRoute } from '@tanstack/vue-router'
import { z } from 'zod'

const cookieSchema = z
  .object({ value: z.string().default(() => `CLIENT-${Date.now()}`) })
  .prefault({})
  .catch(() => ({ value: `CLIENT-${Date.now()}` }))
const RouteComponent = defineComponent({
  setup() {
    const search = Route.useSearch()
    return () => (
      <Link
        data-testid="link-to-set"
        from="/cookies/"
        to="./set"
        search={search.value}
      >
        got to route that sets the cookies with {JSON.stringify(search.value)}
      </Link>
    )
  },
})

export const Route = createFileRoute('/cookies/')({
  validateSearch: cookieSchema,
  component: RouteComponent,
})
