import { createFileRoute } from '@tanstack/react-router'
import cssUrl from './rsc-css-url.css?url'

export const Route = createFileRoute('/rsc-css-url')({
  head: () => ({
    links: [{ rel: 'stylesheet', href: cssUrl }],
  }),
  component: RscCssUrlComponent,
})

function RscCssUrlComponent() {
  return (
    <main>
      <h1 data-testid="rsc-css-url-title">RSC css?url stylesheet</h1>
      <section className="rsc-css-url-card" data-testid="rsc-css-url-card">
        <span className="rsc-css-url-badge">CSS URL</span>
        <h2 className="rsc-css-url-title">Stylesheet imported with ?url</h2>
        <p className="rsc-css-url-text">
          The SSR head should point at a client-served asset URL.
        </p>
      </section>
    </main>
  )
}
