import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  return (
    <main>
      <h1>Rsbuild fixture</h1>
      <p>Error overlay fixture</p>
    </main>
  )
}
