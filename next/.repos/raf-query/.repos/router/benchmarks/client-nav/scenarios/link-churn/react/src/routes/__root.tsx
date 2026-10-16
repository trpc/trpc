import { Link, Outlet, createRootRoute } from '@tanstack/react-router'
import { sortedSearch } from '../../../shared'

export const Route = createRootRoute({
  component: RootComponent,
})

function RootComponent() {
  return (
    <>
      <nav>
        <Link to="/hub/list" data-testid="go-list">
          List
        </Link>
        <Link to="/hub/list" search={sortedSearch} data-testid="go-list-sorted">
          List sorted
        </Link>
        <Link
          to="/hub/detail/$id"
          params={{ id: '1' }}
          data-testid="go-detail-1"
        >
          Detail 1
        </Link>
        <Link
          to="/hub/detail/$id"
          params={{ id: '2' }}
          data-testid="go-detail-2"
        >
          Detail 2
        </Link>
        <Link to="/other" data-testid="go-other">
          Other
        </Link>
      </nav>
      <Outlet />
    </>
  )
}
