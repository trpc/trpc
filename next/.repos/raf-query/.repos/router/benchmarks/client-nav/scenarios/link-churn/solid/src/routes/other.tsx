import { createFileRoute } from '@tanstack/solid-router'
import { otherMarker } from '../../../shared'

export const Route = createFileRoute('/other')({
  component: OtherPage,
})

function OtherPage() {
  return (
    <main>
      <p data-testid="page-state">{otherMarker}</p>
    </main>
  )
}
