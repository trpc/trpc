import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'

export const Route = createFileRoute('/component-hmr-lowercase-named-split')({
  component,
})

function component() {
  const [count, setCount] = useState(0)

  return (
    <main className="hmr-card flex flex-col gap-5">
      <p className="hmr-marker" data-testid="component-hmr-marker">
        component-hmr-lowercase-named-split-baseline
      </p>
      <p data-testid="component-hmr-count">Count: {count}</p>
      <button
        data-testid="component-hmr-increment"
        onClick={() => setCount((value) => value + 1)}
      >
        Increment
      </button>
      <input data-testid="component-hmr-message" defaultValue="" />
    </main>
  )
}
