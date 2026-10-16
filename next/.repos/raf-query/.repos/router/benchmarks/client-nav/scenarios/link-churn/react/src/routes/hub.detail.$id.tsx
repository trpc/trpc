import { Link, createFileRoute } from '@tanstack/react-router'
import { detailMarker } from '../../../shared'

export const Route = createFileRoute('/hub/detail/$id')({
  component: DetailPage,
})

function DetailPage() {
  const params = Route.useParams()

  return (
    <main>
      <p data-testid="page-state">{detailMarker(params.id)}</p>
      <Link to="/hub/list">Back to list</Link>
      <Link to="/hub/detail/$id" params={{ id: String(Number(params.id) + 1) }}>
        Next
      </Link>
      <Link to="/other">Elsewhere</Link>
    </main>
  )
}
