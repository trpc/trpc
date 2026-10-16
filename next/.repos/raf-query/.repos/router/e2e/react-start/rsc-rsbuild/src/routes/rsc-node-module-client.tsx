import { createFileRoute, Link } from '@tanstack/react-router'
import type { CSSProperties } from 'react'
import { getNodeModuleClientServerComponent } from '~/utils/nodeModuleClientServerComponent'

export const Route = createFileRoute('/rsc-node-module-client')({
  loader: async () => {
    const Server = await getNodeModuleClientServerComponent()
    return { Server }
  },
  component: RscNodeModuleClientComponent,
})

const styles = {
  page: {
    maxWidth: '800px',
    padding: '20px',
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  backLink: {
    display: 'inline-block',
    marginBottom: '16px',
    color: '#0284c7',
    fontSize: '13px',
    fontWeight: 'bold',
    textDecoration: 'none',
  },
  title: {
    margin: '0 0 8px 0',
    color: '#1e293b',
    fontSize: '24px',
  },
  description: {
    maxWidth: '680px',
    margin: '0 0 20px 0',
    color: '#64748b',
    lineHeight: '1.5',
  },
  summary: {
    display: 'grid',
    gap: '12px',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    marginBottom: '20px',
  },
  summaryItem: {
    padding: '12px',
    backgroundColor: '#f8fafc',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
  },
  summaryLabel: {
    marginBottom: '4px',
    color: '#475569',
    fontSize: '12px',
    fontWeight: 'bold',
  },
  summaryText: {
    color: '#0f172a',
    fontSize: '13px',
    lineHeight: '1.4',
  },
} satisfies Record<string, CSSProperties>

function RscNodeModuleClientComponent() {
  const { Server } = Route.useLoaderData()

  return (
    <main style={styles.page}>
      <Link to="/" style={styles.backLink}>
        Back to examples
      </Link>
      <h1 data-testid="rsc-node-module-client-title" style={styles.title}>
        RSC node_modules client component
      </h1>
      <p style={styles.description}>
        This route renders a server component that imports a client component
        from a package-style module and hydrates it on the client.
      </p>
      <div style={styles.summary}>
        <div style={styles.summaryItem}>
          <div style={styles.summaryLabel}>Server source</div>
          <div style={styles.summaryText}>
            Route loader + RSC server function
          </div>
        </div>
        <div style={styles.summaryItem}>
          <div style={styles.summaryLabel}>Client source</div>
          <div style={styles.summaryText}>
            Component exported from node_modules
          </div>
        </div>
      </div>
      {Server}
    </main>
  )
}
