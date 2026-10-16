import * as Vue from 'vue'
import { Link, createFileRoute } from '@tanstack/vue-router'
import { detailMarker } from '../../../shared'

const DetailPage = Vue.defineComponent({
  setup() {
    const params = Route.useParams()

    return () => (
      <main>
        <p data-testid="page-state">{detailMarker(params.value.id)}</p>
        <Link to="/hub/list">Back to list</Link>
        <Link
          to="/hub/detail/$id"
          params={{ id: String(Number(params.value.id) + 1) }}
        >
          Next
        </Link>
        <Link to="/other">Elsewhere</Link>
      </main>
    )
  },
})

export const Route = createFileRoute('/hub/detail/$id')({
  component: DetailPage,
})
