import { createFileRoute, Link, linkOptions } from '@tanstack/react-router'
import type { CSSProperties } from 'react'

export const Route = createFileRoute('/')({
  component: Home,
})

const examples = linkOptions([
  {
    to: '/rsc-node-module-client',
    title: 'Node module client component',
    description:
      'Hydrates a client component imported from node_modules inside an RSC route.',
    marker: 'RSC',
    markerColor: '#0284c7',
  },
  {
    to: '/rsc-css-url',
    title: 'css?url stylesheet',
    description:
      'Applies a stylesheet imported with the ?url query from route head metadata.',
    marker: 'CSS',
    markerColor: '#16a34a',
  },
])

const colors = {
  server: '#0284c7',
  client: '#16a34a',
  async: '#f59e0b',
}

const styles = {
  page: {
    maxWidth: '800px',
    padding: '20px',
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  title: {
    margin: '0 0 8px 0',
    color: '#1e293b',
    fontSize: '24px',
  },
  description: {
    color: '#64748b',
    lineHeight: '1.5',
    marginBottom: '20px',
  },
  legend: {
    display: 'flex',
    gap: '16px',
    marginBottom: '20px',
    padding: '12px',
    backgroundColor: '#f8fafc',
    borderRadius: '8px',
    flexWrap: 'wrap',
  },
  legendItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  legendText: {
    color: '#475569',
    fontSize: '13px',
  },
  legendColor: {
    width: '16px',
    height: '16px',
    borderRadius: '4px',
  },
  grid: {
    display: 'grid',
    gap: '16px',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
  },
  card: {
    display: 'block',
    padding: '16px',
    backgroundColor: '#f8fafc',
    borderRadius: '8px',
    border: '1px solid #e2e8f0',
    textDecoration: 'none',
  },
  marker: {
    display: 'grid',
    placeItems: 'center',
    width: '40px',
    height: '32px',
    marginBottom: '8px',
    borderRadius: '6px',
    color: 'white',
    fontSize: '13px',
    fontWeight: 'bold',
  },
  cardTitle: {
    marginBottom: '4px',
    color: '#0f172a',
    fontWeight: 'bold',
  },
  cardDescription: {
    color: '#64748b',
    fontSize: '13px',
    lineHeight: '1.4',
  },
} satisfies Record<string, CSSProperties>

function legendColor(color: string): CSSProperties {
  return {
    ...styles.legendColor,
    backgroundColor: color,
  }
}

function markerStyle(color: string): CSSProperties {
  return {
    ...styles.marker,
    backgroundColor: color,
  }
}

function Home() {
  return (
    <main style={styles.page} data-testid="index-page">
      <h1 data-testid="home-title" style={styles.title}>
        React Server Components Rsbuild E2E Tests
      </h1>
      <p style={styles.description}>
        These examples cover Rsbuild-specific RSC behavior with clear visual
        distinction between server-rendered content and client-side assets.
      </p>

      <div style={styles.legend}>
        <div style={styles.legendItem}>
          <span style={legendColor(colors.server)} />
          <span style={styles.legendText}>Server Rendered (RSC)</span>
        </div>
        <div style={styles.legendItem}>
          <span style={legendColor(colors.client)} />
          <span style={styles.legendText}>Client Hydration and Assets</span>
        </div>
        <div style={styles.legendItem}>
          <span style={legendColor(colors.async)} />
          <span style={styles.legendText}>Rsbuild SSR Coverage</span>
        </div>
      </div>

      <nav style={styles.grid}>
        {examples.map(
          ({ marker, markerColor, title, description, ...link }) => (
            <Link key={link.to} {...link} style={styles.card}>
              <div style={markerStyle(markerColor)}>{marker}</div>
              <div style={styles.cardTitle}>{title}</div>
              <div style={styles.cardDescription}>{description}</div>
            </Link>
          ),
        )}
      </nav>
    </main>
  )
}
