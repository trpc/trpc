import { createFileRoute } from '@tanstack/react-router'
import z from 'zod'

const isBrowser = typeof window !== 'undefined'

export const Route = createFileRoute('/specialChars/search')({
  validateSearch: z.object({
    searchParam: z.string(),
  }),
  beforeLoad: () => ({
    beforeLoadOn: isBrowser ? 'client' : 'server',
  }),
  loader: async () => {
    console.log(`[loader] Running on ${isBrowser ? 'client' : 'server'}`)
    return {
      loadedOn: isBrowser ? 'client' : 'server',
    }
  },
  component: RouteComponent,
})

function RouteComponent() {
  const search = Route.useSearch()
  const { beforeLoadOn } = Route.useRouteContext()
  const { loadedOn } = Route.useLoaderData()

  return (
    <div>
      Hello "/specialChars/search"!
      <div data-testid="special-search-before-load-info">
        Before load on: {beforeLoadOn}
      </div>
      <div data-testid="special-search-loaded-info">Loaded on: {loadedOn}</div>
      <span data-testid={'special-search-param'}>{search.searchParam}</span>
    </div>
  )
}
