import { StrictMode, startTransition } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { StartClient } from '@tanstack/react-start/client'

async function bootstrap() {
  // Fixture-only gate: leave SSR markup, CSS and inline restoration intact.
  // Waiting here allows load to finish before StartClient constructs the router.
  if ((window as any).__holdScrollBootstrap) {
    await new Promise<void>((resolve) => {
      ;(window as any).__releaseScrollBootstrap = resolve
    })
  }
  startTransition(() => {
    hydrateRoot(
      document,
      <StrictMode>
        <StartClient />
      </StrictMode>,
    )
  })
}

void bootstrap()
