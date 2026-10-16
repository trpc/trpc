import { onCleanup, onMount } from 'solid-js'
import { createFileRoute } from '@tanstack/solid-router'

const pendingMinMs = 1500

function recordEvent(type: string) {
  if (typeof window === 'undefined') {
    return
  }

  const global = window as any
  global.__events ??= []
  global.__events.push({ type, t: performance.now() })
}

function Pending() {
  onMount(() => {
    recordEvent('pending-mounted')
  })
  onCleanup(() => {
    recordEvent('pending-unmounted')
  })

  return <div data-testid="ssr-false-pending">Loading SSR false route...</div>
}

function Target() {
  onMount(() => {
    recordEvent('target-mounted')
  })

  return <div data-testid="ssr-false-target">SSR false route loaded</div>
}

export const Route = createFileRoute('/ssr-false-pending-min')({
  ssr: false,
  pendingMs: 0,
  pendingMinMs,
  pendingComponent: Pending,
  loader: async () => {
    recordEvent('loader-start')
    await new Promise((resolve) => setTimeout(resolve, 50))
    recordEvent('loader-done')

    return { ok: true }
  },
  component: Target,
})
