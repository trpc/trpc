import * as Vue from 'vue'
import { Link, createFileRoute } from '@tanstack/vue-router'
import {
  listItemIds,
  listMarker,
  listRelativeTestId,
  listSortedMarker,
} from '../../../shared'

const ascSearch = { sort: 'asc' } as const

// List Links depart whenever the list leaf is left.
const ListLinks = Vue.defineComponent({
  setup() {
    return () => (
      <ul>
        {listItemIds.map((id) => {
          const page = Number(id)
          return (
            <li key={id}>
              <Link to="/hub/detail/$id" params={{ id }}>
                {`Item ${id}`}
              </Link>
              <Link to="/hub/detail/$id" params={{ id }} search={ascSearch}>
                {`Item ${id} asc`}
              </Link>
              <Link
                to="/hub/detail/$id"
                params={{ id }}
                activeOptions={{ exact: true }}
                activeProps={{ class: 'active-link' }}
              >
                {`Item ${id} exact`}
              </Link>
              <Link to="/hub/list" search={(prev) => ({ ...prev, page })}>
                {`Page ${id}`}
              </Link>
              <Link
                to="."
                search={(prev) => ({
                  ...prev,
                  page,
                  sort: 'asc' as const,
                })}
                data-testid={id === '1' ? listRelativeTestId : undefined}
              >
                {`Page ${id} asc`}
              </Link>
            </li>
          )
        })}
      </ul>
    )
  },
})

const ListPage = Vue.defineComponent({
  setup() {
    const sort = Route.useSearch({ select: (search) => search.sort })

    return () => (
      <main>
        <p data-testid="page-state">
          {sort.value === 'desc' ? listSortedMarker : listMarker}
        </p>
        <ListLinks />
      </main>
    )
  },
})

export const Route = createFileRoute('/hub/list')({
  component: ListPage,
})
