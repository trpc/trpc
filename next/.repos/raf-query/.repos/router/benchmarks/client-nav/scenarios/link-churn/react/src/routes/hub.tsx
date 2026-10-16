import { Link, Outlet, createFileRoute } from '@tanstack/react-router'
import {
  hubItemIds,
  hubRelativeTestId,
  validateHubSearch,
} from '../../../shared'

export const Route = createFileRoute('/hub')({
  validateSearch: validateHubSearch,
  component: HubLayout,
})

// Layout Links stay mounted while the hub leaves change.
function HubLinks() {
  return (
    <div>
      {hubItemIds.map((id) => {
        const page = Number(id)
        return (
          <div key={id}>
            <Link to="/hub/detail/$id" params={{ id }}>
              {`Detail ${id}`}
            </Link>
            <Link
              to="/hub/detail/$id"
              params={{ id }}
              activeOptions={{ exact: true }}
              activeProps={{ className: 'active-link' }}
            >
              {`Detail ${id} exact`}
            </Link>
            <Link
              to="/hub/list"
              search={{ page }}
              activeOptions={{ includeSearch: false }}
              activeProps={{ className: 'active-link' }}
            >
              {`List page ${id}`}
            </Link>
            <Link to="/hub/list" search={(prev) => ({ ...prev, page })}>
              {`List keep ${id}`}
            </Link>
            <Link
              to="."
              search={(prev) => ({ ...prev, page })}
              data-testid={id === '1' ? hubRelativeTestId : undefined}
            >
              {`Here page ${id}`}
            </Link>
          </div>
        )
      })}
    </div>
  )
}

function HubLayout() {
  return (
    <section>
      <HubLinks />
      <Outlet />
    </section>
  )
}
