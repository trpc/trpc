import { createFileRoute } from '@tanstack/vue-router'
import SfcStyledBox from '../components/SfcStyledBox.vue'

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  return (
    <main>
      <h1 data-testid="home-heading">Vue Dev SSR Styles Test</h1>
      <SfcStyledBox />
    </main>
  )
}
