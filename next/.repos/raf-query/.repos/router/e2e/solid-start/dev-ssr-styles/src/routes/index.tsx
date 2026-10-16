import { createFileRoute } from '@tanstack/solid-router'
import { CodeSplitStyledBox } from '../components/CodeSplitStyledBox'

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  return (
    <main>
      <h1 data-testid="home-heading">Solid Dev SSR Styles Test</h1>
      <CodeSplitStyledBox />
    </main>
  )
}
