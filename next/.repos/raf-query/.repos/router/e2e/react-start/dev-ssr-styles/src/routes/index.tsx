import { createFileRoute } from '@tanstack/react-router'
import { CodeSplitStyledBox } from '../components/CodeSplitStyledBox'

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  return (
    <div>
      <h1 data-testid="home-heading">Dev SSR Styles Test</h1>
      <CodeSplitStyledBox />
    </div>
  )
}
