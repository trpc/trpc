import { defineComponent } from 'vue'
import { createFileRoute } from '@tanstack/vue-router'
import z from 'zod'

const RouteComponent = defineComponent({
  setup() {
    const search = Route.useSearch()
    return () => (
      <div>
        Hello "/specialChars/malformed/search"!
        <span data-testid={'special-malformed-search-param'}>
          {search.value.searchParam}
        </span>
      </div>
    )
  },
})

export const Route = createFileRoute('/specialChars/malformed/search')({
  validateSearch: z.object({
    searchParam: z.string(),
  }),
  component: RouteComponent,
})
