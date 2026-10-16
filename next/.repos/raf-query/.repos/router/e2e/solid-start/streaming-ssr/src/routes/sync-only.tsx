import { createFileRoute } from '@tanstack/solid-router'
import { makeSyncOnlyData } from '../../../../streaming-ssr-fixtures'

export const Route = createFileRoute('/sync-only')({
  loader: async () => makeSyncOnlyData(),
  component: SyncOnly,
})

function SyncOnly() {
  const data = Route.useLoaderData()

  return (
    <div style={{ padding: '20px' }}>
      <h1 data-testid="sync-title">Synchronous Serialization Test</h1>
      <p data-testid="sync-message">{data().message}</p>
      <p data-testid="sync-timestamp">Loaded at: {data().timestamp}</p>
      <p data-testid="sync-source">Source: {data().source}</p>
      <ul data-testid="sync-items">
        {data().items.map((item) => (
          <li data-testid={`sync-item-${item}`}>{item}</li>
        ))}
      </ul>
    </div>
  )
}
