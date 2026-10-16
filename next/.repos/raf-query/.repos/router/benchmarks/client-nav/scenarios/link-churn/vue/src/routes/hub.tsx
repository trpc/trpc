import * as Vue from 'vue'
import { Link, Outlet, createFileRoute } from '@tanstack/vue-router'
import {
  hubItemIds,
  hubRelativeTestId,
  validateHubSearch,
} from '../../../shared'

// Layout Links stay mounted while the hub leaves change.
const HubLinks = Vue.defineComponent({
  setup() {
    return () => (
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
                activeProps={{ class: 'active-link' }}
              >
                {`Detail ${id} exact`}
              </Link>
              <Link
                to="/hub/list"
                search={{ page }}
                activeOptions={{ includeSearch: false }}
                activeProps={{ class: 'active-link' }}
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
  },
})

const HubLayout = Vue.defineComponent({
  setup() {
    return () => (
      <section>
        <HubLinks />
        <Outlet />
      </section>
    )
  },
})

export const Route = createFileRoute('/hub')({
  validateSearch: validateHubSearch,
  component: HubLayout,
})
