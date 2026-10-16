import { defineComponent } from 'vue'
import { createFileRoute } from '@tanstack/vue-router'
import z from 'zod'

const RouteComponent = defineComponent({
  setup() {
    const search = Route.useSearch()
    return () => (
      <div>
        Hello "/specialChars/search"!
        <span data-testid={'special-search-param'}>
          {search.value.searchParam}
        </span>
      </div>
    )
  },
})

export const Route = createFileRoute('/specialChars/search')({
  validateSearch: z.object({
    searchParam: z.string(),
  }),
  component: RouteComponent,
})
