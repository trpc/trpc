import { createFileRoute } from '@tanstack/react-router'
import embeddedCss from '../styles/embedded.css?inline'

export const Route = createFileRoute('/inline-css')({
  loader: () => embeddedCss,
  component: InlineCss,
})

function InlineCss() {
  const css = Route.useLoaderData()
  return (
    <main>
      <div className="inline-css-layout" data-testid="inline-css-layout">
        Inline styles must not change the page layout.
      </div>
      <pre data-testid="embedded-css">{css}</pre>
    </main>
  )
}
