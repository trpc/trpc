import { NodeModuleClientWidget } from 'rsc-client-pkg'
import type { CSSProperties } from 'react'

const styles = {
  container: {
    padding: '16px',
    backgroundColor: '#e0f2fe',
    border: '2px solid #0284c7',
    borderRadius: '8px',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    marginBottom: '12px',
  },
  badge: {
    display: 'inline-block',
    padding: '2px 8px',
    backgroundColor: '#0284c7',
    borderRadius: '4px',
    color: 'white',
    fontSize: '11px',
    fontWeight: 'bold',
  },
  meta: {
    color: '#64748b',
    fontSize: '12px',
  },
  title: {
    margin: '0 0 8px 0',
    color: '#0c4a6e',
    fontSize: '18px',
  },
  description: {
    margin: '0 0 16px 0',
    color: '#0369a1',
    fontSize: '13px',
    lineHeight: '1.5',
  },
  clientSlot: {
    padding: '14px',
    backgroundColor: '#dcfce7',
    border: '2px solid #16a34a',
    borderRadius: '8px',
  },
  clientLabel: {
    marginBottom: '10px',
    color: '#166534',
    fontSize: '11px',
    fontWeight: 'bold',
  },
} satisfies Record<string, CSSProperties>

export function RscClientPkgContent() {
  return (
    <section
      data-testid="rsc-node-module-client-server"
      style={styles.container}
    >
      <div style={styles.header}>
        <span style={styles.badge}>SERVER</span>
        <span style={styles.meta}>Rendered before hydration</span>
      </div>
      <h2
        data-testid="rsc-node-module-client-server-title"
        style={styles.title}
      >
        Server rendered package boundary
      </h2>
      <p style={styles.description}>
        The server component owns this blue boundary, then hands the interactive
        island below to a client component exported from a module package.
      </p>
      <div style={styles.clientSlot}>
        <div style={styles.clientLabel}>CLIENT COMPONENT FROM NODE_MODULES</div>
        <NodeModuleClientWidget label="Node module clicks" />
      </div>
    </section>
  )
}
