import { createFileRoute } from '@tanstack/react-router'
import '../styles/css-import-order.css'

export const Route = createFileRoute('/css-import-order')({
  component: CssImportOrder,
})

function CssImportOrder() {
  return (
    <main>
      <h1>CSS import order</h1>
      <div className="css-import-order" data-testid="css-import-order">
        The route stylesheet should override its imported base stylesheet.
      </div>
    </main>
  )
}
